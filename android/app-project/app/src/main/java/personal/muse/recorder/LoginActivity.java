package personal.muse.recorder;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.graphics.Typeface;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.InputType;
import android.view.Gravity;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * First screen when there is no session (v1.34.0): a dedicated sign-in
 * page like most apps have, instead of a form buried in Settings.
 * Register / login against the EchoDay platform; on success the session
 * JWT is stored and MainActivity opens. The server URL stays editable
 * here (it is needed before login); once signed in it is changed only
 * by signing out first.
 */
public class LoginActivity extends Activity {
    private Ui.Palette pal;
    private final Handler ui = new Handler(Looper.getMainLooper());
    private final ExecutorService io = Executors.newSingleThreadExecutor();

    private EditText serverInput, emailInput, passwordInput;
    private TextView statusText;
    private Button loginButton, registerButton;
    private boolean busy = false;

    @Override
    protected void attachBaseContext(Context newBase) {
        super.attachBaseContext(LocaleHelper.wrap(newBase));
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (Prefs.cloudLoggedIn(this)) {
            openMain();
            return;
        }
        setTheme(Ui.isDark(this) ? android.R.style.Theme_Material
                : android.R.style.Theme_Material_Light);
        pal = Ui.of(this);

        ScrollView scroll = new ScrollView(this);
        scroll.setBackgroundColor(pal.bg);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(24), dp(40), dp(24), dp(24));
        scroll.addView(root);
        setContentView(scroll);

        TextView mark = new TextView(this);
        mark.setText("● ◗");
        mark.setTextSize(34);
        mark.setTextColor(pal.accent);
        root.addView(mark);

        TextView name = label(getString(R.string.app_name), 28, pal.text, true);
        LinearLayout.LayoutParams np = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        np.topMargin = dp(10);
        name.setLayoutParams(np);
        root.addView(name);
        root.addView(label(getString(R.string.login_tagline), 14, pal.sub, false));
        TextView welcome = label(getString(R.string.login_welcome), 20, pal.text, true);
        LinearLayout.LayoutParams wp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        wp.topMargin = dp(28);
        welcome.setLayoutParams(wp);
        root.addView(welcome);
        root.addView(label(getString(R.string.login_subtitle), 13, pal.sub, false));

        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setBackground(Ui.cardBg(this, pal, 16));
        card.setPadding(dp(16), dp(14), dp(16), dp(16));
        LinearLayout.LayoutParams cp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        cp.topMargin = dp(16);
        card.setLayoutParams(cp);
        root.addView(card);

        card.addView(fieldLabel(getString(R.string.cloud_server_label)));
        serverInput = input(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI, "https://…");
        serverInput.setText(Prefs.cloudUrl(this));
        card.addView(serverInput);

        card.addView(fieldLabel(getString(R.string.cloud_email_label)));
        emailInput = input(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS,
                "you@example.com");
        emailInput.setText(Prefs.cloudEmail(this));
        card.addView(emailInput);

        card.addView(fieldLabel(getString(R.string.cloud_password_label)));
        passwordInput = input(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD, "••••••••");
        card.addView(passwordInput);

        statusText = label("", 13, pal.sub, false);
        LinearLayout.LayoutParams stp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        stp.topMargin = dp(10);
        statusText.setLayoutParams(stp);
        card.addView(statusText);

        loginButton = new Button(this);
        loginButton.setText(R.string.cloud_login);
        Ui.stylePrimary(loginButton, pal);
        LinearLayout.LayoutParams lbp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lbp.topMargin = dp(10);
        loginButton.setLayoutParams(lbp);
        card.addView(loginButton);

        registerButton = new Button(this);
        registerButton.setText(R.string.cloud_register);
        Ui.styleGhost(registerButton, pal);
        LinearLayout.LayoutParams rbp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        rbp.topMargin = dp(8);
        registerButton.setLayoutParams(rbp);
        card.addView(registerButton);

        loginButton.setOnClickListener(v -> doAuth(false));
        registerButton.setOnClickListener(v -> doAuth(true));
    }

    private void doAuth(final boolean register) {
        if (busy) return;
        final String base = serverInput.getText().toString().trim();
        final String email = emailInput.getText().toString().trim();
        final String password = passwordInput.getText().toString();
        if (base.isEmpty() || email.isEmpty() || password.isEmpty()) {
            toast(getString(R.string.cloud_err_fields));
            return;
        }
        // Persist server + email up front (same rule as before: settings
        // save immediately, the password never does).
        Prefs.get(this).edit()
                .putString(Prefs.KEY_CLOUD_URL, base)
                .putString(Prefs.KEY_CLOUD_EMAIL, email)
                .apply();
        busy = true;
        loginButton.setEnabled(false);
        registerButton.setEnabled(false);
        statusText.setText(R.string.cloud_auth_working);
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
                busy = false;
                loginButton.setEnabled(true);
                registerButton.setEnabled(true);
                if (fError != null || fSession == null) {
                    statusText.setText(getString(R.string.cloud_auth_failed,
                            fError == null ? "" : trimErr(fError)));
                    return;
                }
                String userEmail = fSession.user != null
                        ? fSession.user.optString("email", email) : email;
                Prefs.get(LoginActivity.this).edit()
                        .putString(Prefs.KEY_CLOUD_JWT, fSession.token)
                        .putString(Prefs.KEY_CLOUD_EMAIL, userEmail)
                        .apply();
                toast(getString(register ? R.string.cloud_register_ok : R.string.cloud_login_ok));
                Uploader.kick(LoginActivity.this);
                openMain();
            });
        });
    }

    private void openMain() {
        startActivity(new Intent(this, MainActivity.class));
        finish();
    }

    // ---- helpers (same small set every programmatic screen carries) ----

    private static String trimErr(Exception e) {
        String m = e.getMessage();
        if (m == null || m.isEmpty()) m = e.toString();
        return m.length() > 220 ? m.substring(0, 220) + "…" : m;
    }

    private void toast(String msg) {
        Toast.makeText(this, msg, Toast.LENGTH_SHORT).show();
    }

    private int dp(float v) {
        return (int) (v * getResources().getDisplayMetrics().density + 0.5f);
    }

    private TextView label(String text, float sp, int color, boolean bold) {
        TextView tv = new TextView(this);
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
        EditText et = new EditText(this);
        et.setInputType(inputType);
        et.setSingleLine(true);
        et.setHint(hint);
        et.setTextColor(pal.text);
        et.setHintTextColor(pal.sub);
        return et;
    }
}
