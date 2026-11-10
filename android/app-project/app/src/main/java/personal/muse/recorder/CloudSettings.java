package personal.muse.recorder;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Typeface;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONObject;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Settings-tab account card (slimmed in v1.34.0): since sign-in moved
 * to its own first screen, Settings only shows the current account —
 * who is signed in, the plan and its expiry — plus the two account
 * actions: open the Account page (coupon, agent tokens) and sign out.
 */
public final class CloudSettings {
    private final Activity act;
    private final Ui.Palette pal;
    private final Handler ui = new Handler(Looper.getMainLooper());
    private final ExecutorService io = Executors.newSingleThreadExecutor();

    private final TextView statusText;
    private boolean busy = false;

    public CloudSettings(Activity act, ViewGroup container, Ui.Palette pal) {
        this.act = act;
        this.pal = pal;

        LinearLayout card = new LinearLayout(act);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setBackground(Ui.cardBg(act, pal, 16));
        card.setPadding(dp(16), dp(14), dp(16), dp(16));
        container.addView(card);

        statusText = label("", 14, pal.text, false);
        card.addView(statusText);

        TextView hint = label(act.getString(R.string.account_settings_hint), 13, pal.sub, false);
        LinearLayout.LayoutParams hp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        hp.topMargin = dp(6);
        hint.setLayoutParams(hp);
        card.addView(hint);

        Button detailsButton = new Button(act);
        detailsButton.setText(R.string.account_open_details);
        Ui.stylePrimary(detailsButton, pal);
        LinearLayout.LayoutParams dbp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        dbp.topMargin = dp(10);
        detailsButton.setLayoutParams(dbp);
        card.addView(detailsButton);
        detailsButton.setOnClickListener(v ->
                act.startActivity(new Intent(act, AccountActivity.class)));

        Button logoutButton = new Button(act);
        logoutButton.setText(R.string.account_logout_title);
        Ui.styleGhost(logoutButton, pal);
        LinearLayout.LayoutParams lop = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lop.topMargin = dp(8);
        logoutButton.setLayoutParams(lop);
        card.addView(logoutButton);
        logoutButton.setOnClickListener(v -> doLogout());

        refreshState();
    }

    /** Called when the settings tab becomes visible. */
    public void onShow() {
        refreshState();
    }

    private void refreshState() {
        if (!Prefs.cloudLoggedIn(act)) {
            statusText.setText(R.string.cloud_not_logged_in);
            return;
        }
        statusText.setText(act.getString(R.string.cloud_logged_in_as, Prefs.cloudEmail(act)));
        if (busy) return;
        busy = true;
        final String base = Prefs.cloudUrl(act);
        final String jwt = Prefs.cloudJwt(act);
        io.execute(() -> {
            JSONObject me = null;
            Exception error = null;
            try {
                me = MuseCloud.me(base, jwt);
            } catch (Exception e) {
                error = e;
            }
            final JSONObject fMe = me;
            final Exception fError = error;
            ui.post(() -> {
                busy = false;
                if (fError != null) {
                    if (fError instanceof MuseCloud.HttpException
                            && ((MuseCloud.HttpException) fError).code == 401) {
                        // Session revoked/expired server-side: drop it and
                        // return to the sign-in screen.
                        Prefs.get(act).edit().remove(Prefs.KEY_CLOUD_JWT).apply();
                        bounceToLogin();
                    } else {
                        statusText.setText(act.getString(R.string.cloud_status_offline,
                                Prefs.cloudEmail(act), trimErr(fError)));
                    }
                    return;
                }
                statusText.setText(AccountInfo.from(act, fMe).statusLine(act));
            });
        });
    }

    private void doLogout() {
        final String base = Prefs.cloudUrl(act);
        final String jwt = Prefs.cloudJwt(act);
        Prefs.get(act).edit().remove(Prefs.KEY_CLOUD_JWT).apply();
        Toast.makeText(act, act.getString(R.string.cloud_logout_done), Toast.LENGTH_SHORT).show();
        io.execute(() -> MuseCloud.logout(base, jwt));
        bounceToLogin();
    }

    private void bounceToLogin() {
        Intent i = new Intent(act, LoginActivity.class);
        i.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
        act.startActivity(i);
        act.finish();
    }

    // ---- helpers ----

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
}
