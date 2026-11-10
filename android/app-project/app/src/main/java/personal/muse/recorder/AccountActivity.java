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
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONObject;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Account page (v1.34.0), opened from the title-bar chip: the signed-in
 * account, its plan and expiry, coupon redemption, the entry to
 * "Connect my Muse", and sign-out. Everything account-related that
 * used to clutter the Settings tab lives here now.
 */
public class AccountActivity extends Activity {
    private Ui.Palette pal;
    private final Handler ui = new Handler(Looper.getMainLooper());
    private final ExecutorService io = Executors.newSingleThreadExecutor();

    private TextView emailText, planText, expiryText, registeredText, statusText;
    private ProgressBar spinner;
    private EditText couponInput;
    private Button redeemButton;
    private boolean couponBusy = false;
    // Billing card (v1.35.0): subscribe / manage-subscription entry.
    private TextView billingNote;
    private Button subscribeButton, portalButton;
    private boolean billingBusy = false;

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
        android.app.ActionBar ab0 = getActionBar();
        if (ab0 != null) {
            ab0.setIcon(R.mipmap.ic_launcher);
            ab0.setDisplayShowHomeEnabled(true);
        }

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
        TextView title = label(getString(R.string.account_title), 22, pal.text, true);
        LinearLayout.LayoutParams tp = new LinearLayout.LayoutParams(
                0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        tp.leftMargin = dp(10);
        title.setLayoutParams(tp);
        header.addView(title);
        root.addView(header);

        // ---- account info card ----
        LinearLayout card = card(root, dp(14));
        emailText = infoRow(card, getString(R.string.account_email_label),
                Prefs.cloudEmail(this), true);
        planText = infoRow(card, getString(R.string.account_plan_label), "…", false);
        expiryText = infoRow(card, getString(R.string.account_expires_label), "…", false);
        registeredText = infoRow(card, getString(R.string.account_registered_label), "…", false);

        LinearLayout spinRow = new LinearLayout(this);
        spinRow.setOrientation(LinearLayout.HORIZONTAL);
        spinRow.setGravity(Gravity.CENTER_VERTICAL);
        LinearLayout.LayoutParams srp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        srp.topMargin = dp(10);
        spinRow.setLayoutParams(srp);
        spinner = new ProgressBar(this, null, android.R.attr.progressBarStyleSmall);
        spinner.setVisibility(View.GONE);
        spinRow.addView(spinner);
        statusText = label("", 13, pal.sub, false);
        LinearLayout.LayoutParams stp = new LinearLayout.LayoutParams(
                0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        stp.leftMargin = dp(8);
        statusText.setLayoutParams(stp);
        spinRow.addView(statusText);
        card.addView(spinRow);

        // ---- billing card ----
        LinearLayout billingCard = card(root, dp(14));
        billingCard.addView(label(getString(R.string.billing_title), 16, pal.text, true));
        billingNote = label("", 13, pal.sub, false);
        LinearLayout.LayoutParams bnp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        bnp.topMargin = dp(6);
        billingNote.setLayoutParams(bnp);
        billingCard.addView(billingNote);
        subscribeButton = new Button(this);
        subscribeButton.setText(R.string.billing_subscribe);
        Ui.stylePrimary(subscribeButton, pal);
        LinearLayout.LayoutParams sbp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        sbp.topMargin = dp(10);
        subscribeButton.setLayoutParams(sbp);
        billingCard.addView(subscribeButton);
        portalButton = new Button(this);
        portalButton.setText(R.string.billing_manage);
        Ui.styleGhost(portalButton, pal);
        LinearLayout.LayoutParams pbp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        pbp.topMargin = dp(8);
        portalButton.setLayoutParams(pbp);
        portalButton.setVisibility(View.GONE);
        billingCard.addView(portalButton);
        subscribeButton.setOnClickListener(v -> doBilling(true));
        portalButton.setOnClickListener(v -> doBilling(false));

        // ---- coupon card ----
        LinearLayout couponCard = card(root, dp(14));
        couponCard.addView(label(getString(R.string.account_coupon_title), 16, pal.text, true));
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER_VERTICAL);
        LinearLayout.LayoutParams rp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        rp.topMargin = dp(10);
        row.setLayoutParams(rp);
        couponInput = new EditText(this);
        couponInput.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_CAP_CHARACTERS);
        couponInput.setSingleLine(true);
        couponInput.setHint(R.string.cloud_coupon_hint);
        couponInput.setTextColor(pal.text);
        couponInput.setHintTextColor(pal.sub);
        couponInput.setLayoutParams(new LinearLayout.LayoutParams(
                0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        row.addView(couponInput);
        redeemButton = new Button(this);
        redeemButton.setText(R.string.cloud_coupon_redeem);
        Ui.stylePrimary(redeemButton, pal);
        LinearLayout.LayoutParams rbp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        rbp.leftMargin = dp(8);
        redeemButton.setLayoutParams(rbp);
        row.addView(redeemButton);
        couponCard.addView(row);
        redeemButton.setOnClickListener(v -> doRedeemCoupon());

        // ---- connect + sign out ----
        Button connectButton = new Button(this);
        connectButton.setText(R.string.cloud_connect_title);
        Ui.stylePrimary(connectButton, pal);
        LinearLayout.LayoutParams cbp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        cbp.topMargin = dp(16);
        connectButton.setLayoutParams(cbp);
        root.addView(connectButton);
        connectButton.setOnClickListener(v ->
                startActivity(new Intent(this, ConnectActivity.class)));

        Button logoutButton = new Button(this);
        logoutButton.setText(R.string.account_logout_title);
        Ui.styleGhost(logoutButton, pal);
        LinearLayout.LayoutParams lop = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lop.topMargin = dp(10);
        logoutButton.setLayoutParams(lop);
        root.addView(logoutButton);
        logoutButton.setOnClickListener(v -> doLogout());

        loadAccount();
        loadBilling();
    }

    @Override
    protected void onResume() {
        super.onResume();
        // Returning from the browser checkout: refresh plan + billing so
        // a just-paid subscription shows up without restarting the page.
        loadAccount();
        loadBilling();
    }

    private void loadBilling() {
        final String base = Prefs.cloudUrl(this);
        final String jwt = Prefs.cloudJwt(this);
        io.execute(() -> {
            JSONObject b = null;
            Exception error = null;
            try {
                b = MuseCloud.billing(base, jwt);
            } catch (Exception e) {
                error = e;
            }
            final JSONObject fB = b;
            ui.post(() -> {
                if (fB == null) return; // offline: leave the card as-is
                String mode = fB.optString("mode", "");
                boolean portal = fB.optBoolean("portal_available", false);
                if ("paid".equals(mode)) {
                    subscribeButton.setVisibility(View.GONE);
                    billingNote.setText(R.string.billing_paid_note);
                } else {
                    subscribeButton.setVisibility(View.VISIBLE);
                    billingNote.setText("");
                }
                portalButton.setVisibility(portal ? View.VISIBLE : View.GONE);
            });
        });
    }

    /** checkout=true opens Stripe Checkout; false opens the customer portal. */
    private void doBilling(final boolean checkout) {
        if (billingBusy) return;
        billingBusy = true;
        subscribeButton.setEnabled(false);
        portalButton.setEnabled(false);
        toast(getString(R.string.billing_opening));
        final String base = Prefs.cloudUrl(this);
        final String jwt = Prefs.cloudJwt(this);
        io.execute(() -> {
            JSONObject result = null;
            Exception error = null;
            try {
                result = checkout
                        ? MuseCloud.billingCheckout(base, jwt)
                        : MuseCloud.billingPortal(base, jwt);
            } catch (Exception e) {
                error = e;
            }
            final JSONObject fResult = result;
            final Exception fError = error;
            ui.post(() -> {
                billingBusy = false;
                subscribeButton.setEnabled(true);
                portalButton.setEnabled(true);
                if (fError != null || fResult == null) {
                    toast(getString(R.string.cloud_auth_failed,
                            fError == null ? "" : trimErr(fError)));
                    return;
                }
                String url = fResult.optString("url", "");
                if (!url.isEmpty()) {
                    try {
                        startActivity(new Intent(Intent.ACTION_VIEW,
                                android.net.Uri.parse(url)));
                    } catch (Exception e) {
                        toast(getString(R.string.cloud_auth_failed, trimErr(e)));
                    }
                    return;
                }
                // Stub mode on the server: it answers with an explanation
                // instead of a URL until Stripe keys are configured.
                String msg = fResult.optString("message", "");
                toast(msg.isEmpty()
                        ? getString(R.string.cloud_auth_failed, "") : msg);
                loadBilling();
            });
        });
    }

    private void loadAccount() {
        spinner.setVisibility(View.VISIBLE);
        statusText.setText(R.string.refresh_connecting);
        final String base = Prefs.cloudUrl(this);
        final String jwt = Prefs.cloudJwt(this);
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
                spinner.setVisibility(View.GONE);
                if (fError != null) {
                    if (fError instanceof MuseCloud.HttpException
                            && ((MuseCloud.HttpException) fError).code == 401) {
                        bounceToLogin();
                        return;
                    }
                    statusText.setText(getString(R.string.cloud_status_offline,
                            Prefs.cloudEmail(AccountActivity.this), trimErr(fError)));
                    return;
                }
                AccountInfo info = AccountInfo.from(AccountActivity.this, fMe);
                emailText.setText(info.email);
                planText.setText(info.planLabel(AccountActivity.this));
                String expiry = info.expiryLabel(AccountActivity.this);
                expiryText.setText(expiry.isEmpty() ? "—" : expiry);
                registeredText.setText(info.createdDate.isEmpty() ? "—" : info.createdDate);
                statusText.setText("");
            });
        });
    }

    private void doRedeemCoupon() {
        if (couponBusy) return;
        final String code = couponInput.getText().toString().trim();
        if (code.isEmpty()) {
            toast(getString(R.string.cloud_coupon_err_empty));
            return;
        }
        couponBusy = true;
        redeemButton.setEnabled(false);
        couponInput.setEnabled(false);
        redeemButton.setText(R.string.cloud_coupon_working);
        final String base = Prefs.cloudUrl(this);
        final String jwt = Prefs.cloudJwt(this);
        io.execute(() -> {
            JSONObject result = null;
            Exception error = null;
            try {
                result = MuseCloud.redeemCoupon(base, jwt, code);
            } catch (Exception e) {
                error = e;
            }
            final JSONObject fResult = result;
            final Exception fError = error;
            ui.post(() -> {
                couponBusy = false;
                redeemButton.setEnabled(true);
                couponInput.setEnabled(true);
                redeemButton.setText(R.string.cloud_coupon_redeem);
                if (fError != null || fResult == null) {
                    toast(couponErrorText(fError));
                    return;
                }
                couponInput.setText("");
                String until = fResult.optString("paid_until", "");
                if ("lifetime".equals(fResult.optString("kind", "")) || until.startsWith("2099")) {
                    toast(getString(R.string.cloud_coupon_ok_lifetime));
                } else if (until.length() >= 10) {
                    toast(getString(R.string.cloud_coupon_ok_until, until.substring(0, 10)));
                } else {
                    toast(getString(R.string.cloud_coupon_ok_generic));
                }
                loadAccount();
            });
        });
    }

    private String couponErrorText(Exception e) {
        if (e instanceof MuseCloud.HttpException) {
            MuseCloud.HttpException he = (MuseCloud.HttpException) e;
            switch (he.errorCode) {
                case "invalid": return getString(R.string.cloud_coupon_err_invalid);
                case "expired": return getString(R.string.cloud_coupon_err_expired);
                case "exhausted": return getString(R.string.cloud_coupon_err_exhausted);
                case "already_redeemed": return getString(R.string.cloud_coupon_err_already);
                case "disabled": return getString(R.string.cloud_coupon_err_disabled);
                default: break;
            }
            String m = he.getMessage();
            if (m != null && !m.isEmpty()) {
                return getString(R.string.cloud_auth_failed, trimErr(he));
            }
        }
        return getString(R.string.cloud_coupon_err_network);
    }

    private void doLogout() {
        final String base = Prefs.cloudUrl(this);
        final String jwt = Prefs.cloudJwt(this);
        Prefs.get(this).edit().remove(Prefs.KEY_CLOUD_JWT).apply();
        toast(getString(R.string.cloud_logout_done));
        io.execute(() -> MuseCloud.logout(base, jwt));
        bounceToLogin();
    }

    /** Back to the sign-in screen, clearing the whole task stack. */
    private void bounceToLogin() {
        Intent i = new Intent(this, LoginActivity.class);
        i.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
        startActivity(i);
        finish();
    }

    // ---- helpers ----

    private LinearLayout card(LinearLayout root, int topMargin) {
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setBackground(Ui.cardBg(this, pal, 16));
        card.setPadding(dp(16), dp(14), dp(16), dp(16));
        LinearLayout.LayoutParams cp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        cp.topMargin = topMargin;
        card.setLayoutParams(cp);
        root.addView(card);
        return card;
    }

    /** One "label: value" row; returns the value view for later updates. */
    private TextView infoRow(LinearLayout card, String name, String value, boolean first) {
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER_VERTICAL);
        LinearLayout.LayoutParams rp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        if (!first) rp.topMargin = dp(8);
        row.setLayoutParams(rp);
        TextView nameTv = label(name, 14, pal.sub, false);
        nameTv.setLayoutParams(new LinearLayout.LayoutParams(
                dp(84), ViewGroup.LayoutParams.WRAP_CONTENT));
        row.addView(nameTv);
        TextView valueTv = label(value, 14, pal.text, false);
        valueTv.setLayoutParams(new LinearLayout.LayoutParams(
                0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        row.addView(valueTv);
        card.addView(row);
        return valueTv;
    }

    private static String trimErr(Exception e) {
        String m = e == null ? "" : e.getMessage();
        if (m == null || m.isEmpty()) m = e == null ? "" : e.toString();
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
}
