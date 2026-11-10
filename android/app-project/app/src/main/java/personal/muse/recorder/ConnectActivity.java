package personal.muse.recorder;

import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.graphics.Typeface;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * "Connect my Muse" page (v1.34.0): agent token list + generation +
 * one-tap copy of the ready-made instruction paragraph. Moved out of
 * the Settings tab into its own screen, reached from the Account page.
 */
public class ConnectActivity extends Activity {
    private Ui.Palette pal;
    private final Handler ui = new Handler(Looper.getMainLooper());
    private final ExecutorService io = Executors.newSingleThreadExecutor();

    private TextView baseUrlText, newTokenText, statusText;
    private Button createTokenButton, copyTokenButton, copyGuideButton;
    private LinearLayout tokensContainer;
    private boolean busy = false;
    private String lastCreatedToken = null;

    @Override
    protected void attachBaseContext(Context newBase) {
        super.attachBaseContext(LocaleHelper.wrap(newBase));
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setTheme(Ui.isDark(this) ? android.R.style.Theme_Material
                : android.R.style.Theme_Material_Light);
        pal = Ui.of(this);

        ScrollView scroll = new ScrollView(this);
        scroll.setBackgroundColor(pal.bg);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(20), dp(20), dp(20), dp(20));
        scroll.addView(root);
        setContentView(scroll);

        LinearLayout header = new LinearLayout(this);
        header.setOrientation(LinearLayout.HORIZONTAL);
        header.setGravity(Gravity.CENTER_VERTICAL);
        Button back = new Button(this);
        back.setText(R.string.cloud_back);
        Ui.styleGhost(back, pal);
        back.setOnClickListener(v -> finish());
        header.addView(back);
        TextView title = label(getString(R.string.cloud_connect_title), 22, pal.text, true);
        LinearLayout.LayoutParams tp = new LinearLayout.LayoutParams(
                0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        tp.leftMargin = dp(10);
        title.setLayoutParams(tp);
        header.addView(title);
        root.addView(header);
        TextView hint = label(getString(R.string.cloud_connect_hint), 13, pal.sub, false);
        LinearLayout.LayoutParams hp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        hp.topMargin = dp(8);
        hint.setLayoutParams(hp);
        root.addView(hint);

        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setBackground(Ui.cardBg(this, pal, 16));
        card.setPadding(dp(16), dp(14), dp(16), dp(16));
        LinearLayout.LayoutParams cp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        cp.topMargin = dp(14);
        card.setLayoutParams(cp);
        root.addView(card);

        baseUrlText = label(getString(R.string.cloud_base_label, Prefs.cloudUrl(this)),
                13, pal.text, false);
        baseUrlText.setTextIsSelectable(true);
        card.addView(baseUrlText);

        statusText = label("", 13, pal.sub, false);
        LinearLayout.LayoutParams ssp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        ssp.topMargin = dp(8);
        statusText.setLayoutParams(ssp);
        card.addView(statusText);

        tokensContainer = new LinearLayout(this);
        tokensContainer.setOrientation(LinearLayout.VERTICAL);
        LinearLayout.LayoutParams tcp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        tcp.topMargin = dp(8);
        tokensContainer.setLayoutParams(tcp);
        card.addView(tokensContainer);

        createTokenButton = new Button(this);
        createTokenButton.setText(R.string.cloud_token_create);
        Ui.stylePrimary(createTokenButton, pal);
        LinearLayout.LayoutParams cbp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        cbp.topMargin = dp(10);
        createTokenButton.setLayoutParams(cbp);
        card.addView(createTokenButton);

        newTokenText = label("", 13, pal.text, false);
        newTokenText.setTextIsSelectable(true);
        newTokenText.setVisibility(View.GONE);
        LinearLayout.LayoutParams ntp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        ntp.topMargin = dp(10);
        newTokenText.setLayoutParams(ntp);
        card.addView(newTokenText);

        LinearLayout copyRow = new LinearLayout(this);
        copyRow.setOrientation(LinearLayout.HORIZONTAL);
        copyTokenButton = new Button(this);
        copyTokenButton.setText(R.string.cloud_token_copy);
        Ui.styleGhost(copyTokenButton, pal);
        copyTokenButton.setVisibility(View.GONE);
        copyGuideButton = new Button(this);
        copyGuideButton.setText(R.string.cloud_guide_copy);
        Ui.styleGhost(copyGuideButton, pal);
        copyRow.addView(copyTokenButton, weightParams());
        copyRow.addView(copyGuideButton, weightParams());
        card.addView(copyRow);

        createTokenButton.setOnClickListener(v -> doCreateToken());
        copyTokenButton.setOnClickListener(v -> {
            if (lastCreatedToken != null) {
                copy(lastCreatedToken);
                toast(getString(R.string.cloud_token_copied));
            }
        });
        copyGuideButton.setOnClickListener(v -> {
            if (lastCreatedToken == null) {
                toast(getString(R.string.cloud_guide_need_token));
                return;
            }
            copy(getString(R.string.cloud_guide_text, Prefs.cloudUrl(this), lastCreatedToken));
            toast(getString(R.string.cloud_guide_copied));
        });

        loadTokens();
    }

    private void loadTokens() {
        if (busy) return;
        busy = true;
        statusText.setText(R.string.refresh_connecting);
        final String base = Prefs.cloudUrl(this);
        final String jwt = Prefs.cloudJwt(this);
        io.execute(() -> {
            JSONArray tokens = null;
            Exception error = null;
            try {
                tokens = MuseCloud.listTokens(base, jwt);
            } catch (Exception e) {
                error = e;
            }
            final JSONArray fTokens = tokens;
            final Exception fError = error;
            ui.post(() -> {
                busy = false;
                if (fError != null) {
                    statusText.setText(getString(R.string.cloud_auth_failed, trimErr(fError)));
                    return;
                }
                statusText.setText("");
                renderTokens(fTokens);
            });
        });
    }

    private void renderTokens(JSONArray tokens) {
        tokensContainer.removeAllViews();
        if (tokens == null || tokens.length() == 0) {
            tokensContainer.addView(label(getString(R.string.cloud_tokens_empty),
                    13, pal.sub, false));
            return;
        }
        for (int i = 0; i < tokens.length(); i++) {
            JSONObject t = tokens.optJSONObject(i);
            if (t == null) continue;
            final String id = t.optString("id", "");
            String created = t.optString("created_at", "");
            if (created.length() > 10) created = created.substring(0, 10);
            LinearLayout row = new LinearLayout(this);
            row.setOrientation(LinearLayout.HORIZONTAL);
            row.setGravity(Gravity.CENTER_VERTICAL);
            TextView tv = label(getString(R.string.cloud_token_row,
                    t.optString("name", "Muse"), t.optString("prefix", ""), created),
                    13, pal.text, false);
            tv.setLayoutParams(new LinearLayout.LayoutParams(
                    0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
            row.addView(tv);
            Button revoke = new Button(this);
            revoke.setText(R.string.cloud_token_revoke);
            Ui.styleGhost(revoke, pal);
            revoke.setOnClickListener(v -> doRevokeToken(id));
            row.addView(revoke);
            tokensContainer.addView(row);
        }
    }

    private void doCreateToken() {
        createTokenButton.setEnabled(false);
        final String base = Prefs.cloudUrl(this);
        final String jwt = Prefs.cloudJwt(this);
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
                    toast(getString(R.string.cloud_auth_failed,
                            fError == null ? "" : trimErr(fError)));
                    return;
                }
                lastCreatedToken = fCreated.optString("token", "");
                newTokenText.setText(getString(R.string.cloud_token_created_hint)
                        + "\n" + lastCreatedToken);
                newTokenText.setVisibility(View.VISIBLE);
                copyTokenButton.setVisibility(View.VISIBLE);
                toast(getString(R.string.cloud_token_created_toast));
                loadTokens();
            });
        });
    }

    private void doRevokeToken(final String tokenId) {
        if (tokenId == null || tokenId.isEmpty()) return;
        final String base = Prefs.cloudUrl(this);
        final String jwt = Prefs.cloudJwt(this);
        io.execute(() -> {
            Exception error = null;
            try {
                MuseCloud.deleteToken(base, jwt, tokenId);
            } catch (Exception e) {
                error = e;
            }
            final Exception fError = error;
            ui.post(() -> {
                if (fError == null) {
                    toast(getString(R.string.cloud_token_revoked));
                } else {
                    toast(getString(R.string.cloud_auth_failed, trimErr(fError)));
                }
                loadTokens();
            });
        });
    }

    // ---- helpers ----

    private void copy(String text) {
        ClipboardManager cm = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
        if (cm != null) cm.setPrimaryClip(ClipData.newPlainText("EchoDay", text));
    }

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

    private LinearLayout.LayoutParams weightParams() {
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        lp.leftMargin = dp(4);
        lp.rightMargin = dp(4);
        return lp;
    }
}
