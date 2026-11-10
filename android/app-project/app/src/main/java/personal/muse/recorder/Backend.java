package personal.muse.recorder;

import android.content.Context;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.util.ArrayList;
import java.util.List;

/**
 * Unified backend facade. Since v1.28.0 the app talks to exactly one
 * backend — the EchoDay platform — and every feature (upload, cloud
 * browsing, daily reports) goes through this class instead of calling
 * MuseCloud directly. (The self-hosted S3 + Supabase mode that lived
 * here up to v1.27 was removed: the product ships platform-only.)
 *
 * Everything below needs a platform session: "configured" simply means
 * the user is logged in. All methods block; call them off the UI thread.
 */
public final class Backend {
    private Backend() {}

    public interface ProgressListener {
        void onProgress(long sent, long total);
    }

    /** Whether the cloud-browser tab can list anything (logged in). */
    public static boolean browseConfigured(Context ctx) {
        return Prefs.cloudLoggedIn(ctx);
    }

    /** Whether the reports tab can read anything (logged in). */
    public static boolean reportsConfigured(Context ctx) {
        return Prefs.cloudLoggedIn(ctx);
    }

    // ================= upload =================

    /**
     * Uploads one object under the platform key layout
     * ({@code <date>/…}, {@code snapshot-<date>/…}, {@code markers/…}).
     * Failures surface as MuseCloud.HttpException carrying the HTTP
     * status (401/402/413 matter to the caller).
     */
    public static void uploadObject(Context ctx, String key, File file, String contentType,
                                    ProgressListener listener) throws Exception {
        MuseCloud.putObject(Prefs.cloudUrl(ctx), Prefs.cloudJwt(ctx), key, file, contentType,
                listener == null ? null
                        : (sent, total) -> listener.onProgress(sent, total));
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
        /** Billing mode from /me: paid | trial | read_only | "" (unknown). */
        public String billingMode = "";
    }

    public static final class FileEntry {
        /** Platform URL path for this file (download handle). */
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
            if (billing != null) {
                out.quotaBytes = billing.optLong("quotaBytes", -1);
                out.billingMode = billing.optString("mode", "");
            }
        } catch (Exception ignored) {}
        return out;
    }

    public static DayFiles listDay(Context ctx, String date) throws Exception {
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

    public static void download(Context ctx, String locator, File dest) throws Exception {
        MuseCloud.downloadFile(Prefs.cloudUrl(ctx), Prefs.cloudJwt(ctx), locator, dest, null);
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
        /** False when the platform has no result for the day at all. */
        public boolean hasResult = true;
    }

    public static List<ReportDay> listReportDays(Context ctx) throws Exception {
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

    public static ReportDetail getReport(Context ctx, String date) throws Exception {
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

    /** Downloads the day's activity-sheet JPEG into dest. */
    public static void fetchSheetImage(Context ctx, String date, File dest) throws Exception {
        MuseCloud.downloadFile(Prefs.cloudUrl(ctx), Prefs.cloudJwt(ctx),
                "/api/v1/days/" + date + "/sheet", dest, null);
    }
}
