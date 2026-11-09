package personal.muse.recorder;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Locale;

/**
 * Client for the Muse AI Cloud platform (trial, v1.25.0).
 *
 * Two different credentials, never mixed up:
 *  - the phone session JWT from POST /api/v1/auth/login (or /register):
 *    uploads audio/markers/snapshots and manages agent tokens;
 *  - the "muse_…" agent token created under /api/v1/tokens: handed to the
 *    user's own Muse, which pulls days (audio + photos) and pushes the
 *    daily recognition result back. It is only ever displayed/copied here.
 *
 * All methods block; call them off the UI thread.
 */
public final class MuseCloud {
    private MuseCloud() {}

    public interface ProgressListener {
        void onProgress(long sent, long total);
    }

    /** HTTP failure carrying the status code and the server's message. */
    public static final class HttpException extends Exception {
        public final int code;

        public HttpException(int code, String message) {
            super(message);
            this.code = code;
        }
    }

    public static final class Session {
        public final String token;
        public final JSONObject user; // publicUser shape (may be null)

        public Session(String token, JSONObject user) {
            this.token = token;
            this.user = user;
        }
    }

    // ---- auth ----

    public static Session register(String baseUrl, String email, String password) throws Exception {
        JSONObject resp = requestJson(baseUrl, "POST", "/api/v1/auth/register", null,
                credentials(email, password));
        return sessionFrom(resp);
    }

    public static Session login(String baseUrl, String email, String password) throws Exception {
        JSONObject resp = requestJson(baseUrl, "POST", "/api/v1/auth/login", null,
                credentials(email, password));
        return sessionFrom(resp);
    }

    /** Best-effort server-side session revoke; local state is cleared by the caller regardless. */
    public static void logout(String baseUrl, String jwt) {
        try {
            requestJson(baseUrl, "POST", "/api/v1/auth/logout", jwt, new JSONObject());
        } catch (Exception ignored) {
            // The server bumps token_version when it can; a failed call
            // (offline, already revoked) must not block local sign-out.
        }
    }

    /** GET /api/v1/me → publicUser {id, email, created_at, billing{…}, public_url}. */
    public static JSONObject me(String baseUrl, String jwt) throws Exception {
        return requestJson(baseUrl, "GET", "/api/v1/me", jwt, null);
    }

    // ---- agent tokens (user JWT) ----

    public static JSONArray listTokens(String baseUrl, String jwt) throws Exception {
        JSONObject resp = requestJson(baseUrl, "GET", "/api/v1/tokens", jwt, null);
        JSONArray tokens = resp.optJSONArray("tokens");
        return tokens != null ? tokens : new JSONArray();
    }

    /** Creates a token; the response carries the full "muse_…" token exactly once. */
    public static JSONObject createToken(String baseUrl, String jwt, String name) throws Exception {
        JSONObject body = new JSONObject();
        body.put("name", name);
        return requestJson(baseUrl, "POST", "/api/v1/tokens", jwt, body);
    }

    public static void deleteToken(String baseUrl, String jwt, String tokenId) throws Exception {
        requestJson(baseUrl, "DELETE", "/api/v1/tokens/" + tokenId, jwt, null);
    }

    // ---- upload (user JWT) ----

    /**
     * PUT /api/v1/upload/{key} with the same object keys the S3 uploader
     * uses. 402 (trial/subscription lapsed) and 413 (storage quota full)
     * come back as HttpException with the server's message in getMessage().
     */
    public static void putObject(String baseUrl, String jwt, String key, File file,
                                 String contentType, ProgressListener listener) throws Exception {
        HttpURLConnection conn = open(trimBase(baseUrl) + "/api/v1/upload/" + encodeKey(key), "PUT");
        conn.setConnectTimeout(30_000);
        conn.setReadTimeout(300_000);
        conn.setDoOutput(true);
        conn.setRequestProperty("Authorization", "Bearer " + jwt);
        conn.setRequestProperty("Content-Type", contentType);
        conn.setFixedLengthStreamingMode(file.length());
        try (OutputStream out = conn.getOutputStream();
             InputStream in = new FileInputStream(file)) {
            byte[] buf = new byte[128 * 1024];
            int n;
            long sent = 0;
            long total = file.length();
            while ((n = in.read(buf)) > 0) {
                out.write(buf, 0, n);
                sent += n;
                if (listener != null) listener.onProgress(sent, total);
            }
        }
        int code = conn.getResponseCode();
        if (code < 200 || code >= 300) {
            String message = serverMessage(readBody(conn));
            conn.disconnect();
            throw new HttpException(code, message);
        }
        conn.disconnect();
    }

    // ---- user-side reads (user JWT): days browsing + reports ----

    /** GET a JSON document from the platform API with the session JWT. */
    public static JSONObject getJson(String baseUrl, String jwt, String path) throws Exception {
        return requestJson(baseUrl, "GET", path, jwt, null);
    }

    /**
     * Streams a platform file (path is server-relative, e.g. the "url"
     * field of a day manifest entry, or /api/v1/days/{date}/sheet) to a
     * local file with the session JWT.
     */
    public static void downloadFile(String baseUrl, String jwt, String path, File dest,
                                    ProgressListener listener) throws Exception {
        String p = path == null ? "" : path.trim();
        String url = p.startsWith("http://") || p.startsWith("https://")
                ? p : trimBase(baseUrl) + (p.startsWith("/") ? p : "/" + p);
        HttpURLConnection conn = open(url, "GET");
        conn.setConnectTimeout(30_000);
        conn.setReadTimeout(300_000);
        if (jwt != null && !jwt.isEmpty()) {
            conn.setRequestProperty("Authorization", "Bearer " + jwt);
        }
        int code = conn.getResponseCode();
        if (code < 200 || code >= 300) {
            String message = serverMessage(readBody(conn));
            conn.disconnect();
            throw new HttpException(code, message);
        }
        long total = conn.getContentLengthLong();
        long done = 0;
        try (InputStream in = conn.getInputStream();
             OutputStream out = new java.io.FileOutputStream(dest)) {
            byte[] buf = new byte[128 * 1024];
            int n;
            while ((n = in.read(buf)) > 0) {
                out.write(buf, 0, n);
                done += n;
                if (listener != null) listener.onProgress(done, total);
            }
        }
        conn.disconnect();
    }

    // ---- plumbing ----

    private static JSONObject credentials(String email, String password) throws Exception {
        JSONObject body = new JSONObject();
        body.put("email", email.trim());
        body.put("password", password);
        body.put("client", "android");
        return body;
    }

    private static Session sessionFrom(JSONObject resp) throws Exception {
        String token = resp.optString("token", "");
        if (token.isEmpty()) throw new Exception("Response had no session token");
        return new Session(token, resp.optJSONObject("user"));
    }

    private static JSONObject requestJson(String baseUrl, String method, String path,
                                          String jwt, JSONObject body) throws Exception {
        HttpURLConnection conn = open(trimBase(baseUrl) + path, method);
        conn.setConnectTimeout(20_000);
        conn.setReadTimeout(60_000);
        if (jwt != null && !jwt.isEmpty()) {
            conn.setRequestProperty("Authorization", "Bearer " + jwt);
        }
        if (body != null) {
            byte[] bytes = body.toString().getBytes(StandardCharsets.UTF_8);
            conn.setDoOutput(true);
            conn.setRequestProperty("Content-Type", "application/json; charset=utf-8");
            conn.setFixedLengthStreamingMode(bytes.length);
            try (OutputStream out = conn.getOutputStream()) {
                out.write(bytes);
            }
        }
        int code = conn.getResponseCode();
        String resp = readBody(conn);
        conn.disconnect();
        if (code < 200 || code >= 300) {
            throw new HttpException(code, serverMessage(resp));
        }
        if (resp == null || resp.trim().isEmpty()) return new JSONObject();
        return new JSONObject(resp);
    }

    /** Extracts the "message" field of a platform error body, if present. */
    private static String serverMessage(String body) {
        if (body != null) {
            try {
                String m = new JSONObject(body).optString("message", "");
                if (!m.isEmpty()) return m;
            } catch (Exception ignored) {}
            String flat = body.replace('\n', ' ').trim();
            if (!flat.isEmpty()) {
                return flat.length() > 300 ? flat.substring(0, 300) + "…" : flat;
            }
        }
        return "";
    }

    private static HttpURLConnection open(String url, String method) throws Exception {
        HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
        conn.setRequestMethod(method);
        return conn;
    }

    static String trimBase(String baseUrl) {
        String u = baseUrl == null ? "" : baseUrl.trim();
        while (u.endsWith("/")) u = u.substring(0, u.length() - 1);
        // The trial server is plain http on a VPS; default to http when the
        // user typed a bare host (an https:// prefix stays untouched).
        if (!u.contains("://")) u = "http://" + u;
        return u;
    }

    private static String encodeKey(String key) {
        String[] parts = key.split("/", -1);
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < parts.length; i++) {
            if (i > 0) sb.append('/');
            sb.append(encodeSegment(parts[i]));
        }
        return sb.toString();
    }

    private static String encodeSegment(String s) {
        StringBuilder sb = new StringBuilder();
        for (byte raw : s.getBytes(StandardCharsets.UTF_8)) {
            int c = raw & 0xFF;
            boolean ok = (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z')
                    || (c >= '0' && c <= '9') || c == '-' || c == '_' || c == '.' || c == '~';
            if (ok) sb.append((char) c);
            else sb.append('%').append(String.format(Locale.US, "%02X", c));
        }
        return sb.toString();
    }

    private static String readBody(HttpURLConnection conn) {
        InputStream stream = conn.getErrorStream();
        if (stream == null) {
            try {
                stream = conn.getInputStream();
            } catch (Exception ignored) {
                return "";
            }
        }
        try (InputStream in = stream) {
            ByteArrayOutputStream bos = new ByteArrayOutputStream();
            byte[] buf = new byte[4096];
            int n;
            while ((n = in.read(buf)) > 0) bos.write(buf, 0, n);
            return bos.toString("UTF-8");
        } catch (Exception e) {
            return "";
        }
    }
}
