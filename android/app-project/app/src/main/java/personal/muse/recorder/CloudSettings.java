package personal.muse.recorder;

import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Typeface;
import android.os.Handler;
import android.os.Looper;
import android.text.Editable;
import android.text.InputType;
import android.text.TextWatcher;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.Switch;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Settings card for the EchoDay account (v1.25.0): account register /
 * login inside the app and the in-app "Connect my Muse" section
 * (agent tokens + one-tap copy of the ready-made instruction
 * paragraph). Since v1.28.0 this is the only backend card — the app
 * is platform-only.
 *
 * Settings persist immediately (same rule as the snapshot switches): the
 * server URL and email are written on every change; the password is never
 * persisted — only the session JWT returned by the platform.
 */
public final class CloudSettings {
    private final Activity act;
    private final Ui.Palette pal;
    private final Handler ui = new Handler(Looper.getMainLooper());
    private final ExecutorService io = Executors.newSingleThreadExecutor();

    private final EditText serverInput, emailInput, passwordInput;
    private final TextView statusText, baseUrlText, newTokenText;
    private final Button registerButton, loginButton, logoutButton;
    private final Button createTokenButton, copyTokenButton, copyGuideButton;
    private final LinearLayout tokensContainer;
    private final View connectSection;

    private boolean loading = true;
    private boolean busy = false;
    private String lastCreatedToken = null;

    public CloudSettings(Activity act, ViewGroup container, Ui.Palette pal) {
        this.act = act;
        this.pal = pal;

        LinearLayout card = new LinearLayout(act);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setBackground(Ui.cardBg(act, pal, 16));
        card.setPadding(dp(16), dp(14), dp(16), dp(16));
        container.addView(card);

        TextView hint = label(act.getString(R.string.cloud_hint), 13, pal.sub, false);
        card.addView(hint);

        card.addView(fieldLabel(act.getString(R.string.cloud_server_label)));
        serverInput = input(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI, "http://…");
        serverInput.setText(Prefs.cloudUrl(act));
        card.addView(serverInput);

        card.addView(fieldLabel(act.getString(R.string.cloud_email_label)));
        emailInput = input(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS,
                "you@example.com");
        emailInput.setText(Prefs.cloudEmail(act));
        card.addView(emailInput);

        card.addView(fieldLabel(act.getString(R.string.cloud_password_label)));
        passwordInput = input(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD, "••••••••");
        card.addView(passwordInput);

        statusText = label("", 13, pal.sub, false);
        LinearLayout.LayoutParams stp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        stp.topMargin = dp(10);
        statusText.setLayoutParams(stp);
        card.addView(statusText);

        LinearLayout authRow = new LinearLayout(act);
        authRow.setOrientation(LinearLayout.HORIZONTAL);
        authRow.setGravity(Gravity.CENTER_VERTICAL);
        LinearLayout.LayoutParams arp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        arp.topMargin = dp(8);
        authRow.setLayoutParams(arp);
        registerButton = new Button(act);
        registerButton.setText(R.string.cloud_register);
        Ui.styleGhost(registerButton, pal);
        loginButton = new Button(act);
        loginButton.setText(R.string.cloud_login);
        Ui.stylePrimary(loginButton, pal);
        logoutButton = new Button(act);
        logoutButton.setText(R.string.cloud_logout);
        Ui.styleGhost(logoutButton, pal);
        authRow.addView(registerButton, weightParams());
        authRow.addView(loginButton, weightParams());
        authRow.addView(logoutButton, weightParams());
        card.addView(authRow);

        // ---- Connect my Muse ----
        LinearLayout connect = new LinearLayout(act);
        connect.setOrientation(LinearLayout.VERTICAL);
        LinearLayout.LayoutParams cp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        cp.topMargin = dp(16);
        connect.setLayoutParams(cp);
        card.addView(connect);
        connectSection = connect;

        View divider = new View(act);
        divider.setBackgroundColor(pal.divider);
        connect.addView(divider, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, dp(1)));

        TextView connectTitle = label(act.getString(R.string.cloud_connect_title), 16, pal.text, true);
        LinearLayout.LayoutParams ctp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        ctp.topMargin = dp(12);
        connectTitle.setLayoutParams(ctp);
        connect.addView(connectTitle);
        connect.addView(label(act.getString(R.string.cloud_connect_hint), 13, pal.sub, false));

        baseUrlText = label("", 13, pal.text, false);
        baseUrlText.setTextIsSelectable(true);
        LinearLayout.LayoutParams bup = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        bup.topMargin = dp(8);
        baseUrlText.setLayoutParams(bup);
        connect.addView(baseUrlText);

        tokensContainer = new LinearLayout(act);
        tokensContainer.setOrientation(LinearLayout.VERTICAL);
        connect.addView(tokensContainer);

        createTokenButton = new Button(act);
        createTokenButton.setText(R.string.cloud_token_create);
        Ui.stylePrimary(createTokenButton, pal);
        LinearLayout.LayoutParams cbp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        cbp.topMargin = dp(10);
        createTokenButton.setLayoutParams(cbp);
        connect.addView(createTokenButton);

        newTokenText = label("", 13, pal.text, false);
        newTokenText.setTextIsSelectable(true);
        newTokenText.setVisibility(View.GONE);
        LinearLayout.LayoutParams ntp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        ntp.topMargin = dp(10);
        newTokenText.setLayoutParams(ntp);
        connect.addView(newTokenText);

        LinearLayout copyRow = new LinearLayout(act);
        copyRow.setOrientation(LinearLayout.HORIZONTAL);
        copyTokenButton = new Button(act);
        copyTokenButton.setText(R.string.cloud_token_copy);
        Ui.styleGhost(copyTokenButton, pal);
        copyTokenButton.setVisibility(View.GONE);
        copyGuideButton = new Button(act);
        copyGuideButton.setText(R.string.cloud_guide_copy);
        Ui.styleGhost(copyGuideButton, pal);
        copyRow.addView(copyTokenButton, weightParams());
        copyRow.addView(copyGuideButton, weightParams());
        connect.addView(copyRow);

        // ---- wiring ----

        // Server URL + email persist on every keystroke (never behind a
        // Save button, so killing the app cannot lose them).
        serverInput.addTextChangedListener(new SimpleWatcher() {
            @Override public void afterTextChanged(Editable s) {
                if (loading) return;
                Prefs.get(act).edit().putString(Prefs.KEY_CLOUD_URL, s.toString().trim()).apply();
                updateBaseUrlText();
            }
        });
        emailInput.addTextChangedListener(new SimpleWatcher() {
            @Override public void afterTextChanged(Editable s) {
                if (loading) return;
                Prefs.get(act).edit().putString(Prefs.KEY_CLOUD_EMAIL, s.toString().trim()).apply();
            }
        });

        registerButton.setOnClickListener(v -> doAuth(true));
        loginButton.setOnClickListener(v -> doAuth(false));
        logoutButton.setOnClickListener(v -> doLogout());
        createTokenButton.setOnClickListener(v -> doCreateToken());
        copyTokenButton.setOnClickListener(v -> {
            if (lastCreatedToken != null) {
                copy(lastCreatedToken);
                toast(act.getString(R.string.cloud_token_copied));
            }
        });
        copyGuideButton.setOnClickListener(v -> {
            if (lastCreatedToken == null) {
                toast(act.getString(R.string.cloud_guide_need_token));
                return;
            }
            copy(act.getString(R.string.cloud_guide_text, Prefs.cloudUrl(act), lastCreatedToken));
            toast(act.getString(R.string.cloud_guide_copied));
        });

        loading = false;
        updateBaseUrlText();
        refreshState(false);
    }

    /** Called when the settings tab becomes visible. */
    public void onShow() {
        refreshState(false);
    }

    // ---- state / refresh ----

    private void refreshState(boolean forceTokens) {
        boolean loggedIn = Prefs.cloudLoggedIn(act);
        logoutButton.setVisibility(loggedIn ? View.VISIBLE : View.GONE);
        registerButton.setVisibility(loggedIn ? View.GONE : View.VISIBLE);
        loginButton.setVisibility(loggedIn ? View.GONE : View.VISIBLE);
        passwordInput.setVisibility(loggedIn ? View.GONE : View.VISIBLE);
        if (!loggedIn) {
            statusText.setText(R.string.cloud_not_logged_in);
            tokensContainer.removeAllViews();
            tokensContainer.addView(label(act.getString(R.string.cloud_tokens_login_first),
                    13, pal.sub, false));
            return;
        }
        statusText.setText(act.getString(R.string.cloud_logged_in_as, Prefs.cloudEmail(act)));
        if (busy) return;
        busy = true;
        final String base = Prefs.cloudUrl(act);
        final String jwt = Prefs.cloudJwt(act);
        io.execute(() -> {
            JSONObject me = null;
            JSONArray tokens = null;
            Exception error = null;
            try {
                me = MuseCloud.me(base, jwt);
                tokens = MuseCloud.listTokens(base, jwt);
            } catch (Exception e) {
                error = e;
            }
            final JSONObject fMe = me;
            final JSONArray fTokens = tokens;
            final Exception fError = error;
            ui.post(() -> {
                busy = false;
                if (fError != null) {
                    if (fError instanceof MuseCloud.HttpException
                            && ((MuseCloud.HttpException) fError).code == 401) {
                        // Session revoked/expired server-side: drop it.
                        Prefs.get(act).edit().remove(Prefs.KEY_CLOUD_JWT).apply();
                        refreshState(false);
                    } else {
                        statusText.setText(act.getString(R.string.cloud_status_offline,
                                Prefs.cloudEmail(act), trimErr(fError)));
                    }
                    return;
                }
                statusText.setText(billingLine(fMe));
                renderTokens(fTokens);
            });
        });
    }

    private String billingLine(JSONObject me) {
        String email = me != null ? me.optString("email", "") : "";
        if (email.isEmpty()) email = Prefs.cloudEmail(act);
        JSONObject billing = me != null ? me.optJSONObject("billing") : null;
        if (billing == null) return act.getString(R.string.cloud_logged_in_as, email);
        String mode = billing.optString("mode", "");
        if ("paid".equals(mode)) {
            return act.getString(R.string.cloud_status_paid, email);
        }
        if ("trial".equals(mode)) {
            String until = billing.optString("trialEndsAt", "");
            if (until.length() > 10) until = until.substring(0, 10);
            return act.getString(R.string.cloud_status_trial, email, until);
        }
        return act.getString(R.string.cloud_status_readonly, email);
    }

    private void renderTokens(JSONArray tokens) {
        tokensContainer.removeAllViews();
        if (tokens == null || tokens.length() == 0) {
            tokensContainer.addView(label(act.getString(R.string.cloud_tokens_empty),
                    13, pal.sub, false));
            return;
        }
        for (int i = 0; i < tokens.length(); i++) {
            JSONObject t = tokens.optJSONObject(i);
            if (t == null) continue;
            final String id = t.optString("id", "");
            String created = t.optString("created_at", "");
            if (created.length() > 10) created = created.substring(0, 10);
            LinearLayout row = new LinearLayout(act);
            row.setOrientation(LinearLayout.HORIZONTAL);
            row.setGravity(Gravity.CENTER_VERTICAL);
            TextView tv = label(act.getString(R.string.cloud_token_row,
                    t.optString("name", "Muse"), t.optString("prefix", ""), created),
                    13, pal.text, false);
            tv.setLayoutParams(new LinearLayout.LayoutParams(0,
                    ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
            row.addView(tv);
            Button revoke = new Button(act);
            revoke.setText(R.string.cloud_token_revoke);
            Ui.styleGhost(revoke, pal);
            revoke.setOnClickListener(v -> doRevokeToken(id));
            row.addView(revoke);
            tokensContainer.addView(row);
        }
    }

    // ---- actions ----

    private void doAuth(final boolean register) {
        final String base = Prefs.cloudUrl(act);
        final String email = emailInput.getText().toString().trim();
        final String password = passwordInput.getText().toString();
        if (email.isEmpty() || password.isEmpty()) {
            toast(act.getString(R.string.cloud_err_fields));
            return;
        }
        setAuthBusy(true);
        io.execute(() -> {
            MuseCloud.Session session = null;
            Exception error = null;
            try {
                session = register
                        ? MuseCloud.register(base, email, password)
                        : MuseCloud.login(base, email, password);
            } catch (Exception e) {
                error = e;
            }
            final MuseCloud.Session fSession = session;
            final Exception fError = error;
            ui.post(() -> {
                setAuthBusy(false);
                if (fError != null || fSession == null) {
                    toast(act.getString(R.string.cloud_auth_failed,
                            fError == null ? "" : trimErr(fError)));
                    return;
                }
                String userEmail = fSession.user != null
                        ? fSession.user.optString("email", email) : email;
                Prefs.get(act).edit()
                        .putString(Prefs.KEY_CLOUD_JWT, fSession.token)
                        .putString(Prefs.KEY_CLOUD_EMAIL, userEmail)
                        .apply();
                passwordInput.setText("");
                toast(act.getString(register ? R.string.cloud_register_ok : R.string.cloud_login_ok));
                Uploader.kick(act);
                refreshState(true);
            });
        });
    }

    private void doLogout() {
        final String base = Prefs.cloudUrl(act);
        final String jwt = Prefs.cloudJwt(act);
        Prefs.get(act).edit().remove(Prefs.KEY_CLOUD_JWT).apply();
        lastCreatedToken = null;
        newTokenText.setVisibility(View.GONE);
        copyTokenButton.setVisibility(View.GONE);
        toast(act.getString(R.string.cloud_logout_done));
        refreshState(false);
        io.execute(() -> MuseCloud.logout(base, jwt));
    }

    private void doCreateToken() {
        if (!Prefs.cloudLoggedIn(act)) {
            toast(act.getString(R.string.cloud_tokens_login_first));
            return;
        }
        createTokenButton.setEnabled(false);
        final String base = Prefs.cloudUrl(act);
        final String jwt = Prefs.cloudJwt(act);
        io.execute(() -> {
            JSONObject created = null;
            Exception error = null;
            try {
                created = MuseCloud.createToken(base, jwt, "Muse");
            } catch (Exception e) {
                error = e;
            }
            final JSONObject fCreated = created;
            final Exception fError = error;
            ui.post(() -> {
                createTokenButton.setEnabled(true);
                if (fError != null || fCreated == null) {
                    toast(act.getString(R.string.cloud_auth_failed,
                            fError == null ? "" : trimErr(fError)));
                    return;
                }
                lastCreatedToken = fCreated.optString("token", "");
                newTokenText.setText(act.getString(R.string.cloud_token_created_hint)
                        + "\n" + lastCreatedToken);
                newTokenText.setVisibility(View.VISIBLE);
                copyTokenButton.setVisibility(View.VISIBLE);
                toast(act.getString(R.string.cloud_token_created_toast));
                refreshState(true);
            });
        });
    }

    private void doRevokeToken(final String tokenId) {
        if (tokenId == null || tokenId.isEmpty()) return;
        final String base = Prefs.cloudUrl(act);
        final String jwt = Prefs.cloudJwt(act);
        io.execute(() -> {
            Exception error = null;
            try {
                MuseCloud.deleteToken(base, jwt, tokenId);
            } catch (Exception e) {
                error = e;
            }
            final Exception fError = error;
            ui.post(() -> {
                toast(act.getString(fError == null
                        ? R.string.cloud_token_revoked : R.string.cloud_auth_failed,
                        fError == null ? "" : trimErr(fError)));
                refreshState(true);
            });
        });
    }

    // ---- helpers ----

    private void setAuthBusy(boolean busyNow) {
        registerButton.setEnabled(!busyNow);
        loginButton.setEnabled(!busyNow);
        if (busyNow) statusText.setText(R.string.cloud_auth_working);
    }

    private void updateBaseUrlText() {
        baseUrlText.setText(act.getString(R.string.cloud_base_label, Prefs.cloudUrl(act)));
    }

    private void copy(String text) {
        ClipboardManager cm = (ClipboardManager) act.getSystemService(Context.CLIPBOARD_SERVICE);
        if (cm != null) cm.setPrimaryClip(ClipData.newPlainText("EchoDay", text));
    }

    private void toast(String msg) {
        Toast.makeText(act, msg, Toast.LENGTH_SHORT).show();
    }

    private static String trimErr(Exception e) {
        String m = e.getMessage();
        if (m == null || m.isEmpty()) m = e.toString();
        return m.length() > 220 ? m.substring(0, 220) + "…" : m;
    }

    private int dp(float v) {
        return (int) (v * act.getResources().getDisplayMetrics().density + 0.5f);
    }

    private TextView label(String text, float sp, int color, boolean bold) {
        TextView tv = new TextView(act);
        tv.setText(text);
        tv.setTextSize(sp);
        tv.setTextColor(color);
        if (bold) tv.setTypeface(Typeface.DEFAULT_BOLD);
        return tv;
    }

    private TextView fieldLabel(String text) {
        TextView tv = label(text, 14, pal.text, false);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.topMargin = dp(10);
        tv.setLayoutParams(lp);
        return tv;
    }

    private EditText input(int inputType, String hint) {
        EditText et = new EditText(act);
        et.setInputType(inputType);
        et.setSingleLine(true);
        et.setHint(hint);
        et.setTextColor(pal.text);
        et.setHintTextColor(pal.sub);
        return et;
    }

    private LinearLayout.LayoutParams weightParams() {
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0,
                ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        lp.leftMargin = dp(4);
        lp.rightMargin = dp(4);
        return lp;
    }

    private abstract static class SimpleWatcher implements TextWatcher {
        @Override public void beforeTextChanged(CharSequence s, int a, int b, int c) {}
        @Override public void onTextChanged(CharSequence s, int a, int b, int c) {}
    }
}
