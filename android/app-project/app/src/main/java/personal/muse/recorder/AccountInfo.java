package personal.muse.recorder;

import android.content.Context;

import org.json.JSONObject;

/**
 * Shared formatting of the platform /me payload (account email + billing
 * block) for the title-bar chip, the Settings account card and the
 * Account page, so all three always agree on plan and expiry wording.
 */
public final class AccountInfo {
    public final String email;
    public final String mode;        // paid | trial | read_only | ""
    public final boolean lifetime;
    public final String expiryDate;  // yyyy-MM-dd or "" when none applies
    public final String createdDate; // yyyy-MM-dd or ""

    private AccountInfo(String email, String mode, boolean lifetime,
                        String expiryDate, String createdDate) {
        this.email = email;
        this.mode = mode;
        this.lifetime = lifetime;
        this.expiryDate = expiryDate;
        this.createdDate = createdDate;
    }

    public static AccountInfo from(Context ctx, JSONObject me) {
        String email = me != null ? me.optString("email", "") : "";
        if (email.isEmpty()) email = Prefs.cloudEmail(ctx);
        String created = me != null ? me.optString("created_at", "") : "";
        if (created.length() > 10) created = created.substring(0, 10);
        JSONObject billing = me != null ? me.optJSONObject("billing") : null;
        if (billing == null) return new AccountInfo(email, "", false, "", created);
        String mode = billing.optString("mode", "");
        boolean lifetime = false;
        String expiry = "";
        if ("paid".equals(mode)) {
            String until = billing.optString("paidUntil", "");
            if (until.startsWith("2099")) {
                lifetime = true;
            } else if (until.length() >= 10) {
                expiry = until.substring(0, 10);
            }
        } else if ("trial".equals(mode)) {
            String until = billing.optString("trialEndsAt", "");
            if (until.length() >= 10) expiry = until.substring(0, 10);
        }
        return new AccountInfo(email, mode, lifetime, expiry, created);
    }

    /** Short plan name: 付费版 / 免费试用 / 只读 / 永久会员. */
    public String planLabel(Context ctx) {
        if (lifetime) return ctx.getString(R.string.account_plan_lifetime);
        switch (mode) {
            case "paid": return ctx.getString(R.string.account_plan_paid);
            case "trial": return ctx.getString(R.string.account_plan_trial);
            case "read_only": return ctx.getString(R.string.account_plan_readonly);
            default: return "";
        }
    }

    /** Expiry display: a date, 永不过期 for lifetime, or "" when unknown. */
    public String expiryLabel(Context ctx) {
        if (lifetime) return ctx.getString(R.string.account_expires_never);
        return expiryDate;
    }

    /** Title-bar chip: "email · 付费 · 到 2026-11-16" style, one line. */
    public String chipText(Context ctx) {
        if (lifetime) return ctx.getString(R.string.chip_lifetime, email);
        if ("paid".equals(mode)) {
            return expiryDate.isEmpty()
                    ? ctx.getString(R.string.chip_paid, email)
                    : ctx.getString(R.string.chip_paid_until, email, expiryDate);
        }
        if ("trial".equals(mode)) {
            return expiryDate.isEmpty()
                    ? email
                    : ctx.getString(R.string.chip_trial, email, expiryDate);
        }
        if ("read_only".equals(mode)) return ctx.getString(R.string.chip_readonly, email);
        return email;
    }

    /** Full status line used by the Settings card (matches the old wording). */
    public String statusLine(Context ctx) {
        if (lifetime) return ctx.getString(R.string.cloud_status_paid_lifetime, email);
        if ("paid".equals(mode)) {
            return expiryDate.isEmpty()
                    ? ctx.getString(R.string.cloud_status_paid, email)
                    : ctx.getString(R.string.cloud_status_paid_until, email, expiryDate);
        }
        if ("trial".equals(mode)) {
            return ctx.getString(R.string.cloud_status_trial, email, expiryDate);
        }
        if ("read_only".equals(mode)) {
            return ctx.getString(R.string.cloud_status_readonly, email);
        }
        return ctx.getString(R.string.cloud_logged_in_as, email);
    }
}
