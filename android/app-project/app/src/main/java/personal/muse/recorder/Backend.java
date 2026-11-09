package personal.muse.recorder;

import android.content.Context;
import android.util.Base64;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Date;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * Unified backend facade (v1.26.0). The user picks one backend mode in
 * Settings — self-hosted (own S3/R2 bucket + own Supabase project) or the
 * EchoDay platform — and every feature (upload, cloud browsing,
 * daily reports) goes through this class instead of talking to S3 /
 * MuseCloud / Supabase directly.
 *
 * Mode dispatch follows Prefs.backendMode(); for uploads the platform is
 * only used while a session exists (the v1.25 rule), otherwise uploads
 * fall back to S3 exactly as before.
 *
 * All methods block; call them off the UI thread.
 */
public final class Backend {
    private Backend() {}

    public interface ProgressListener {
        void onProgress(long sent, long total);
    }

    public static boolean isCloud(Context ctx) {
        return Prefs.isCloudBackend(ctx);
    }

    /** Whether the cloud-browser tab can list anything in the current mode. */
    public static boolean browseConfigured(Context ctx) {
        return isCloud(ctx) ? Prefs.cloudLoggedIn(ctx) : Prefs.s3Configured(ctx);
    }

    /** Whether the reports tab can read anything in the current mode. */
    public static boolean reportsConfigured(Context ctx) {
        return isCloud(ctx) ? Prefs.cloudLoggedIn(ctx)
                : !Prefs.supabaseKey(ctx).trim().isEmpty();
    }

    // ================= upload =================

    /**
     * Uploads one object under the same key layout both backends share
     * ({@code <date>/…}, {@code snapshot-<date>/…}, {@code markers/…}).
     * Platform failures surface as MuseCloud.HttpException carrying the
     * HTTP status (401/402/413 matter to the caller).
     */
    public static void uploadObject(Context ctx, String key, File file, String contentType,
                                    ProgressListener listener) throws Exception {
        if (isCloud(ctx) && Prefs.cloudLoggedIn(ctx)) {
            MuseCloud.putObject(Prefs.cloudUrl(ctx), Prefs.cloudJwt(ctx), key, file, contentType,
                    listener == null ? null
                            : (sent, total) -> listener.onProgress(sent, total));
        } else {
            S3.putObject(Prefs.s3Config(ctx), key, file, contentType,
                    listener == null ? null
                            : (sent, total) -> listener.onProgress(sent, total));
        }
    }

    /** True when uploads in the current mode will go to the platform. */
    public static boolean uploadViaCloud(Context ctx) {
        return isCloud(ctx) && Prefs.cloudLoggedIn(ctx);
    }

    // ================= cloud browsing =================

    public static final class DateEntry {
        public String date;
        public int audioCount;
        public int snapshotCount;
        public long bytes;
        public boolean countsKnown;
        public String summaryExcerpt = "";
    }

    public static final class DatesResult {
        public final List<DateEntry> dates = new ArrayList<>();
        public long totalBytes = -1;
        public long quotaBytes = -1;
    }

    public static final class FileEntry {
        /** Backend-specific handle: an S3 key, or a platform URL path. */
        public String locator;
        public String name;
        public long size;
        public boolean photo;
    }

    public static final class DayFiles {
        public final List<FileEntry> photos = new ArrayList<>();
        public final List<FileEntry> audio = new ArrayList<>();
    }

    public static DatesResult listDates(Context ctx) throws Exception {
        return isCloud(ctx) ? cloudListDates(ctx) : s3ListDates(ctx);
    }

    public static DayFiles listDay(Context ctx, String date) throws Exception {
        return isCloud(ctx) ? cloudListDay(ctx, date) : s3ListDay(ctx, date);
    }

    public static void download(Context ctx, String locator, File dest) throws Exception {
        if (isCloud(ctx)) {
            MuseCloud.downloadFile(Prefs.cloudUrl(ctx), Prefs.cloudJwt(ctx), locator, dest, null);
        } else {
            S3.download(Prefs.s3Config(ctx), locator, dest);
        }
    }

    // ---- browsing: self-hosted (S3) ----

    private static DatesResult s3ListDates(Context ctx) throws Exception {
        S3.Config cfg = Prefs.s3Config(ctx);
        S3.ListResult res = S3.list(cfg, "", "/");
        Set<String> dates = new HashSet<>();
        for (String p : res.prefixes) {
            String name = p.endsWith("/") ? p.substring(0, p.length() - 1) : p;
            if (name.matches("\\d{4}-\\d{2}-\\d{2}")) dates.add(name);
            else if (name.startsWith("snapshot-")) {
                String d = name.substring("snapshot-".length());
                if (d.matches("\\d{4}-\\d{2}-\\d{2}")) dates.add(d);
            }
        }
        // One full pass: bucket total + per-date counts.
        long total = -1;
        Map<String, int[]> counts = new HashMap<>();
        boolean countsKnown = true;
        try {
            S3.ListResult all = S3.list(cfg, "", "");
            total = 0;
            for (S3.Entry e : all.entries) {
                total += e.size;
                String k = e.key;
                if (k.startsWith("snapshot-") && k.endsWith(".jpg")) {
                    String d = k.substring("snapshot-".length());
                    int slash = d.indexOf('/');
                    if (slash > 0) {
                        d = d.substring(0, slash);
                        if (d.matches("\\d{4}-\\d{2}-\\d{2}")) {
                            counts.computeIfAbsent(d, x -> new int[2])[0]++;
                        }
                    }
                } else if (k.length() > 11 && k.endsWith(".m4a")
                        && k.substring(0, 10).matches("\\d{4}-\\d{2}-\\d{2}")
                        && k.charAt(10) == '/') {
                    counts.computeIfAbsent(k.substring(0, 10), x -> new int[2])[1]++;
                }
            }
        } catch (Exception ignored) {
            // Counts/total are decorative; dates alone still render.
            total = -1;
            counts.clear();
            countsKnown = false;
        }
        List<String> sorted = new ArrayList<>(dates);
        sorted.sort(Collections.reverseOrder());
        DatesResult out = new DatesResult();
        out.totalBytes = total;
        out.quotaBytes = 10_000_000_000L; // R2 free tier: 10 GB
        for (String d : sorted) {
            DateEntry di = new DateEntry();
            di.date = d;
            di.countsKnown = countsKnown;
            int[] c = counts.get(d);
            if (c != null) {
                di.snapshotCount = c[0];
                di.audioCount = c[1];
            }
            out.dates.add(di);
        }
        return out;
    }

    private static DayFiles s3ListDay(Context ctx, String date) throws Exception {
        S3.Config cfg = Prefs.s3Config(ctx);
        S3.ListResult audio = S3.list(cfg, date + "/", "");
        S3.ListResult snaps = S3.list(cfg, "snapshot-" + date + "/", "");
        DayFiles out = new DayFiles();
        for (S3.Entry e : snaps.entries) if (e.key.endsWith(".jpg")) out.photos.add(s3Entry(e, true));
        for (S3.Entry e : audio.entries) if (e.key.endsWith(".m4a")) out.audio.add(s3Entry(e, false));
        return out;
    }

    private static FileEntry s3Entry(S3.Entry e, boolean photo) {
        FileEntry it = new FileEntry();
        it.locator = e.key;
        it.size = e.size;
        it.photo = photo;
        it.name = e.key.substring(e.key.lastIndexOf('/') + 1);
        return it;
    }

    // ---- browsing: EchoDay ----

    private static DatesResult cloudListDates(Context ctx) throws Exception {
        JSONObject resp = MuseCloud.getJson(Prefs.cloudUrl(ctx), Prefs.cloudJwt(ctx), "/api/v1/days");
        JSONArray arr = resp.optJSONArray("days");
        DatesResult out = new DatesResult();
        long total = 0;
        if (arr != null) {
            for (int i = 0; i < arr.length(); i++) {
                JSONObject o = arr.optJSONObject(i);
                if (o == null) continue;
                DateEntry di = new DateEntry();
                di.date = o.optString("date");
                di.audioCount = o.optInt("audio_count");
                di.snapshotCount = o.optInt("snapshot_count");
                di.bytes = o.optLong("bytes");
                di.countsKnown = true;
                di.summaryExcerpt = o.optString("summary_excerpt", "");
                total += di.bytes;
                out.dates.add(di);
            }
        }
        out.totalBytes = total;
        // Quota for the storage card: best effort from /me billing.
        try {
            JSONObject me = MuseCloud.me(Prefs.cloudUrl(ctx), Prefs.cloudJwt(ctx));
            JSONObject billing = me != null ? me.optJSONObject("billing") : null;
            if (billing != null) out.quotaBytes = billing.optLong("quotaBytes", -1);
        } catch (Exception ignored) {}
        return out;
    }

    private static DayFiles cloudListDay(Context ctx, String date) throws Exception {
        JSONObject resp = MuseCloud.getJson(Prefs.cloudUrl(ctx), Prefs.cloudJwt(ctx),
                "/api/v1/days/" + date);
        DayFiles out = new DayFiles();
        JSONArray snaps = resp.optJSONArray("snapshots");
        if (snaps != null) {
            for (int i = 0; i < snaps.length(); i++) {
                JSONObject o = snaps.optJSONObject(i);
                if (o != null) out.photos.add(cloudEntry(o, true));
            }
        }
        JSONArray audio = resp.optJSONArray("audio");
        if (audio != null) {
            for (int i = 0; i < audio.length(); i++) {
                JSONObject o = audio.optJSONObject(i);
                if (o != null) out.audio.add(cloudEntry(o, false));
            }
        }
        return out;
    }

    private static FileEntry cloudEntry(JSONObject o, boolean photo) {
        FileEntry it = new FileEntry();
        it.name = o.optString("filename");
        it.size = o.optLong("bytes");
        it.photo = photo;
        it.locator = o.optString("url", "");
        return it;
    }

    // ================= daily reports =================

    public static final class ReportDay {
        public String day;
        public String summary = "";
        public int segments;
        /** >= 0 when an activity sheet exists and its counts are known. */
        public int sheetPhotos = -1;
        public int sheetClusters = -1;
        public boolean hasSheet;
    }

    public static final class ReportDetail {
        public String summary = "";
        public final List<String> analyses = new ArrayList<>();
        public boolean analysesFailed;
        public String photoAnalysis;
        public boolean hasSheet;
        public int sheetPhotos = -1;
        public int sheetClusters = -1;
        /** False when the backend has no result for the day at all. */
        public boolean hasResult = true;
    }

    public static List<ReportDay> listReportDays(Context ctx) throws Exception {
        return isCloud(ctx) ? cloudListReportDays(ctx) : supabaseListReportDays(ctx);
    }

    public static ReportDetail getReport(Context ctx, String date) throws Exception {
        return isCloud(ctx) ? cloudGetReport(ctx, date) : supabaseGetReport(ctx, date);
    }

    /** Downloads the day's activity-sheet JPEG into dest. */
    public static void fetchSheetImage(Context ctx, String date, File dest) throws Exception {
        if (isCloud(ctx)) {
            MuseCloud.downloadFile(Prefs.cloudUrl(ctx), Prefs.cloudJwt(ctx),
                    "/api/v1/days/" + date + "/sheet", dest, null);
            return;
        }
        JSONArray arr = new JSONArray(supabaseGet(ctx, "/rest/v1/daily_sheets"
                + "?select=image_base64&day=eq." + enc(date)));
        if (arr.length() == 0) throw new java.io.IOException("empty");
        byte[] bytes = Base64.decode(arr.getJSONObject(0).optString("image_base64"),
                Base64.DEFAULT);
        try (OutputStream out = new FileOutputStream(dest)) {
            out.write(bytes);
        }
    }

    // ---- reports: self-hosted (Supabase PostgREST) ----

    private static List<ReportDay> supabaseListReportDays(Context ctx) throws Exception {
        JSONArray arr = new JSONArray(supabaseGet(ctx, "/rest/v1/daily_summaries"
                + "?select=day,summary_text,segment_count&order=day.desc&limit=90"));
        List<ReportDay> out = new ArrayList<>();
        for (int i = 0; i < arr.length(); i++) {
            JSONObject o = arr.getJSONObject(i);
            ReportDay d = new ReportDay();
            d.day = o.optString("day");
            d.summary = o.optString("summary_text");
            d.segments = o.optInt("segment_count");
            out.add(d);
        }
        // Activity-sheet metadata for every day (one query, no images) so
        // the list cards can show the sheet button; table may not exist.
        try {
            JSONArray sarr = new JSONArray(supabaseGet(ctx, "/rest/v1/daily_sheets"
                    + "?select=day,photo_count,cluster_count"));
            Map<String, int[]> sheets = new HashMap<>();
            for (int i = 0; i < sarr.length(); i++) {
                JSONObject o = sarr.getJSONObject(i);
                sheets.put(o.optString("day"), new int[]{
                        o.optInt("photo_count"), o.optInt("cluster_count")});
            }
            for (ReportDay d : out) {
                int[] s = sheets.get(d.day);
                if (s != null) {
                    d.sheetPhotos = s[0];
                    d.sheetClusters = s[1];
                    d.hasSheet = true;
                }
            }
        } catch (Exception ignored) {
            // No sheets (or no table): cards simply have no button.
        }
        return out;
    }

    private static ReportDetail supabaseGetReport(Context ctx, String date) throws Exception {
        ReportDetail out = new ReportDetail();
        JSONArray sarr = new JSONArray(supabaseGet(ctx, "/rest/v1/daily_summaries"
                + "?select=summary_text,segment_count&day=eq." + enc(date)));
        if (sarr.length() == 0) {
            out.hasResult = false;
            return out;
        }
        out.summary = sarr.getJSONObject(0).optString("summary_text");
        try {
            String next = nextDay(date);
            String path = "/rest/v1/analyses?select=window_start,window_end,analysis_text"
                    + "&order=window_start.asc"
                    + "&window_start=gte." + enc(date + " 00:00")
                    + "&window_start=lt." + enc(next + " 00:00");
            JSONArray arr = new JSONArray(supabaseGet(ctx, path));
            for (int i = 0; i < arr.length(); i++) {
                out.analyses.add(arr.getJSONObject(i).optString("analysis_text"));
            }
        } catch (Exception e) {
            out.analysesFailed = true;
        }
        // Activity-sheet metadata (no image yet); table may not exist yet.
        try {
            JSONArray sh = new JSONArray(supabaseGet(ctx, "/rest/v1/daily_sheets"
                    + "?select=photo_count,cluster_count&day=eq." + enc(date)));
            if (sh.length() > 0) {
                out.sheetPhotos = sh.getJSONObject(0).optInt("photo_count");
                out.sheetClusters = sh.getJSONObject(0).optInt("cluster_count");
                out.hasSheet = true;
            }
        } catch (Exception ignored) {
            // No sheet for this day (or table not created yet): no button.
        }
        return out;
    }

    private static String supabaseGet(Context ctx, String path) throws Exception {
        String base = Prefs.supabaseUrl(ctx).trim();
        if (base.endsWith("/")) base = base.substring(0, base.length() - 1);
        String key = Prefs.supabaseKey(ctx).trim();
        HttpURLConnection conn = (HttpURLConnection) new URL(base + path).openConnection();
        conn.setConnectTimeout(20_000);
        conn.setReadTimeout(60_000);
        conn.setRequestProperty("apikey", key);
        conn.setRequestProperty("Authorization", "Bearer " + key);
        conn.setRequestProperty("Accept", "application/json");
        int code = conn.getResponseCode();
        InputStream in = code >= 200 && code < 300 ? conn.getInputStream() : conn.getErrorStream();
        String body = "";
        if (in != null) {
            java.io.ByteArrayOutputStream bos = new java.io.ByteArrayOutputStream();
            byte[] b = new byte[8192];
            int n;
            while ((n = in.read(b)) > 0) bos.write(b, 0, n);
            body = bos.toString("UTF-8");
        }
        conn.disconnect();
        if (code < 200 || code >= 300) {
            throw new java.io.IOException("HTTP " + code + " " + body);
        }
        return body;
    }

    // ---- reports: EchoDay ----

    private static List<ReportDay> cloudListReportDays(Context ctx) throws Exception {
        JSONObject resp = MuseCloud.getJson(Prefs.cloudUrl(ctx), Prefs.cloudJwt(ctx), "/api/v1/days");
        JSONArray arr = resp.optJSONArray("days");
        List<ReportDay> out = new ArrayList<>();
        if (arr != null) {
            for (int i = 0; i < arr.length(); i++) {
                JSONObject o = arr.optJSONObject(i);
                if (o == null) continue;
                ReportDay d = new ReportDay();
                d.day = o.optString("date");
                String excerpt = o.optString("summary_excerpt", "");
                d.summary = excerpt == null ? "" : excerpt;
                d.segments = o.optInt("audio_count");
                out.add(d);
            }
        }
        return out;
    }

    private static ReportDetail cloudGetReport(Context ctx, String date) throws Exception {
        ReportDetail out = new ReportDetail();
        JSONObject resp;
        try {
            resp = MuseCloud.getJson(Prefs.cloudUrl(ctx), Prefs.cloudJwt(ctx),
                    "/api/v1/days/" + date + "/result");
        } catch (MuseCloud.HttpException e) {
            if (e.code == 404) {
                // Day exists (or not) but no result pushed yet.
                out.hasResult = false;
                return out;
            }
            throw e;
        }
        out.summary = resp.optString("markdown", "");
        JSONArray analyses = resp.optJSONArray("analyses_json");
        if (analyses != null) {
            for (int i = 0; i < analyses.length(); i++) {
                String text = analysisText(analyses.opt(i));
                if (!text.isEmpty()) out.analyses.add(text);
            }
        }
        String photo = resp.optString("photo_analysis_markdown", "");
        out.photoAnalysis = (photo == null || photo.isEmpty()) ? null : photo;
        out.hasSheet = resp.optBoolean("has_sheet", false);
        return out;
    }

    /** analyses_json elements may be plain strings or objects; be liberal. */
    private static String analysisText(Object el) {
        if (el == null) return "";
        if (el instanceof String) return (String) el;
        if (el instanceof JSONObject) {
            JSONObject o = (JSONObject) el;
            for (String key : new String[]{"markdown", "text", "analysis_text", "content"}) {
                String v = o.optString(key, "");
                if (!v.isEmpty()) return v;
            }
        }
        return "";
    }

    // ---- shared helpers ----

    private static String enc(String s) throws Exception {
        return URLEncoder.encode(s, "UTF-8").replace("+", "%20");
    }

    private static String nextDay(String day) {
        try {
            SimpleDateFormat f = new SimpleDateFormat("yyyy-MM-dd", Locale.US);
            Date d = f.parse(day);
            return f.format(new Date(d.getTime() + 86_400_000L));
        } catch (Exception e) {
            return day;
        }
    }
}
