package personal.muse.recorder;

import android.app.Activity;
import android.graphics.Bitmap;
import android.graphics.drawable.ColorDrawable;
import android.graphics.BitmapFactory;
import android.os.Handler;
import android.os.Looper;
import android.util.Base64;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.BaseAdapter;
import android.widget.Button;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ListView;
import android.widget.ProgressBar;
import android.widget.TextView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
* The "reports" tab: reads the daily summaries (and, per day, the window
* analyses) from the EchoDay platform via Backend — the user's own agent
* pushes each day's result there. (Class name kept from the Supabase era;
* since v1.28.0 it only talks to the platform.) Read-only.
*/
public final class SupabaseReports {
private final Activity act;
private final Ui.Palette pal;
private final Handler ui = new Handler(Looper.getMainLooper());
private final ExecutorService io = Executors.newSingleThreadExecutor();

private final TextView title, status, detailText, dayTitle;
private final ProgressBar spinner;
private final Button backButton, refreshButton, sheetButton;
private final ImageView sheetImage;
private final ListView list;
private final View detail, header, detailBar;

private boolean detailOpen = false;
private boolean pendingAutoSheet = false;
private int generation = 0;
private long loadedAtMs = 0;

// Daily activity sheet (daily_sheets table): metadata first, the ~1 MB
// base64 image only when the user taps the button.
private String sheetDay = null;
private String sheetButtonLabel = "";
private Bitmap sheetBitmap = null;
private boolean sheetBusy = false;

private static final class DayRow {
String day;
String summary;
int segments;
int sheetPhotos = -1;
int sheetClusters = -1;
}

private final List<DayRow> days = new ArrayList<>();
private final BaseAdapter adapter = new BaseAdapter() {
@Override public int getCount() { return days.size();}
@Override public Object getItem(int pos) { return days.get(pos);}
@Override public long getItemId(int pos) { return pos;}

@Override
public View getView(int pos, View convert, ViewGroup parent) {
// Mockup day card: bold date + segment count right, one-line summary
// preview, and (for days with an activity sheet) a primary button that
// jumps straight into the detail with the sheet shown.
DayRow d = days.get(pos);
LinearLayout outer = new LinearLayout(act);
outer.setOrientation(LinearLayout.VERTICAL);
outer.setPadding(dp(20), dp(5), dp(20), dp(5));
LinearLayout card = new LinearLayout(act);
card.setOrientation(LinearLayout.VERTICAL);
card.setBackground(Ui.cardBg(act, pal, 16));
card.setPadding(dp(16), dp(14), dp(16), dp(14));
outer.addView(card);
LinearLayout top = new LinearLayout(act);
top.setOrientation(LinearLayout.HORIZONTAL);
top.setGravity(Gravity.CENTER_VERTICAL);
TextView dateTv = new TextView(act);
dateTv.setText(d.day);
dateTv.setTextSize(17);
dateTv.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
dateTv.setTextColor(pal.text);
top.addView(dateTv);
TextView segTv = new TextView(act);
segTv.setText(act.getString(R.string.reports_segments, d.segments));
segTv.setTextSize(13);
segTv.setTextColor(pal.sub);
segTv.setGravity(Gravity.END);
segTv.setLayoutParams(new LinearLayout.LayoutParams(
0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));
top.addView(segTv);
card.addView(top);
String preview = firstLine(d.summary);
if (!preview.isEmpty()) {
TextView pv = new TextView(act);
pv.setText(preview);
pv.setTextSize(14);
pv.setTextColor(pal.sub);
pv.setSingleLine(true);
pv.setEllipsize(android.text.TextUtils.TruncateAt.END);
LinearLayout.LayoutParams plp = new LinearLayout.LayoutParams(
LinearLayout.LayoutParams.MATCH_PARENT,
LinearLayout.LayoutParams.WRAP_CONTENT);
plp.topMargin = dp(6);
pv.setLayoutParams(plp);
card.addView(pv);
}
if (d.sheetPhotos >= 0) {
Button b = new Button(act);
b.setText(act.getString(R.string.reports_sheet_button,
d.sheetPhotos, d.sheetClusters));
Ui.stylePrimary(b, pal);
LinearLayout.LayoutParams blp = new LinearLayout.LayoutParams(
LinearLayout.LayoutParams.MATCH_PARENT,
LinearLayout.LayoutParams.WRAP_CONTENT);
blp.topMargin = dp(12);
b.setLayoutParams(blp);
b.setOnClickListener(v -> openDay(d, true));
card.addView(b);
}
return outer;
}
};

private int dp(float v) {
return (int) (v * act.getResources().getDisplayMetrics().density + 0.5f);
}

private static String firstLine(String s) {
// Clean one-line preview: strip all markdown markers, not just ##.
return Markdown.stripToPlain(s);
}

private CharSequence renderMd(String text) {
return Markdown.render(act, text, pal, detailText.getTextSize());
}

public SupabaseReports(Activity act) {
this.act = act;
this.pal = Ui.of(act);
title = act.findViewById(R.id.reportsTitle);
status = act.findViewById(R.id.reportsStatus);
spinner = act.findViewById(R.id.reportsSpinner);
detailText = act.findViewById(R.id.reportsDetailText);
dayTitle = act.findViewById(R.id.reportsDayTitle);
backButton = act.findViewById(R.id.reportsBackButton);
refreshButton = act.findViewById(R.id.reportsRefreshButton);
sheetButton = act.findViewById(R.id.reportsSheetButton);
sheetImage = act.findViewById(R.id.reportsSheetImage);
list = act.findViewById(R.id.reportsList);
detail = act.findViewById(R.id.reportsDetail);
header = act.findViewById(R.id.reportsHeader);
detailBar = act.findViewById(R.id.reportsDetailBar);
((TextView) act.findViewById(R.id.reportsAppName)).setTextColor(pal.sub);
((TextView) act.findViewById(R.id.reportsSubtitle)).setTextColor(pal.sub);
title.setTextColor(pal.text);
dayTitle.setTextColor(pal.text);
status.setTextColor(pal.sub);
detailText.setTextColor(pal.text);
Ui.styleGhost(backButton, pal);
Ui.styleGhost(refreshButton, pal);
Ui.stylePrimary(sheetButton, pal);
list.setDivider(new ColorDrawable(android.graphics.Color.TRANSPARENT));
list.setDividerHeight(0);
list.setAdapter(adapter);
backButton.setOnClickListener(v -> onBack());
refreshButton.setOnClickListener(v -> loadDays());
sheetButton.setOnClickListener(v -> onSheetButton());
list.setOnItemClickListener((parent, view, pos, id) -> openDay(days.get(pos), false));
}

public void onShow() {
if (!detailOpen && System.currentTimeMillis() - loadedAtMs > 60_000) loadDays();
}

/** Returns true if the back press was consumed. */
public boolean onBack() {
if (!detailOpen) return false;
detailOpen = false;
pendingAutoSheet = false;
resetSheet();
detail.setVisibility(View.GONE);
list.setVisibility(View.VISIBLE);
detailBar.setVisibility(View.GONE);
header.setVisibility(View.VISIBLE);
hideSpinner();
status.setText("");
return true;
}

private boolean configured() {
return Backend.reportsConfigured(act);
}

/** Refresh feedback (v1.34.0): spinner + the stage the load is in. */
private void showStage(int stageRes) {
ui.post(() -> {
spinner.setVisibility(View.VISIBLE);
status.setText(act.getString(stageRes));
});
}

private void hideSpinner() {
ui.post(() -> spinner.setVisibility(View.GONE));
}

private void loadDays() {
if (!configured()) {
days.clear();
adapter.notifyDataSetChanged();
status.setText(act.getString(R.string.reports_not_configured_cloud));
return;
}
final int gen = ++generation;
showStage(R.string.refresh_connecting);
io.execute(() -> {
try {
showStage(R.string.refresh_fetch_reports);
List<Backend.ReportDay> rows = Backend.listReportDays(act);
List<DayRow> out = new ArrayList<>();
for (Backend.ReportDay r : rows) {
DayRow d = new DayRow();
d.day = r.day;
d.summary = r.summary;
d.segments = r.segments;
d.sheetPhotos = r.sheetPhotos;
d.sheetClusters = r.sheetClusters;
out.add(d);
}
ui.post(() -> {
if (gen != generation) return;
hideSpinner();
loadedAtMs = System.currentTimeMillis();
days.clear();
days.addAll(out);
adapter.notifyDataSetChanged();
status.setText(out.isEmpty()
? act.getString(R.string.reports_empty) : "");
});
} catch (Exception e) {
if (gen != generation) return;
ui.post(() -> {
hideSpinner();
status.setText(
act.getString(R.string.reports_failed, trimErr(e)));
});
}
});
}

private void resetSheet() {
sheetDay = null;
sheetBitmap = null;
sheetBusy = false;
sheetButton.setVisibility(View.GONE);
sheetImage.setVisibility(View.GONE);
sheetImage.setImageBitmap(null);
}

private void onSheetButton() {
if (sheetDay == null || sheetBusy) return;
if (sheetBitmap != null) {
boolean show = sheetImage.getVisibility() != View.VISIBLE;
sheetImage.setVisibility(show ? View.VISIBLE : View.GONE);
sheetButton.setText(show
? act.getString(R.string.reports_sheet_hide) : sheetButtonLabel);
return;
}
sheetBusy = true;
sheetButton.setText(act.getString(R.string.reports_sheet_loading));
final String day = sheetDay;
final int gen = generation;
io.execute(() -> {
try {
java.io.File dest = new java.io.File(act.getCacheDir(), "sheet_" + day + ".jpg");
Backend.fetchSheetImage(act, day, dest);
Bitmap bmp = BitmapFactory.decodeFile(dest.getAbsolutePath());
if (bmp == null) throw new java.io.IOException("decode failed");
ui.post(() -> {
sheetBusy = false;
if (gen != generation || !detailOpen) return;
sheetBitmap = bmp;
sheetImage.setImageBitmap(bmp);
sheetImage.setVisibility(View.VISIBLE);
sheetButton.setText(act.getString(R.string.reports_sheet_hide));
});
} catch (Exception e) {
ui.post(() -> {
sheetBusy = false;
if (gen != generation || !detailOpen) return;
sheetButton.setText(sheetButtonLabel);
status.setText(act.getString(R.string.reports_sheet_failed, trimErr(e)));
});
}
});
}

private void openDay(DayRow d, boolean autoSheet) {
final int gen = ++generation;
detailOpen = true;
pendingAutoSheet = autoSheet;
resetSheet();
sheetDay = d.day;
list.setVisibility(View.GONE);
detail.setVisibility(View.VISIBLE);
header.setVisibility(View.GONE);
detailBar.setVisibility(View.VISIBLE);
dayTitle.setText(d.day);
detailText.setText(renderMd(d.summary));
showStage(R.string.refresh_connecting);
io.execute(() -> {
showStage(R.string.refresh_fetch_day);
Backend.ReportDetail rep = null;
Exception error = null;
try {
rep = Backend.getReport(act, d.day);
} catch (Exception e) {
error = e;
}
final Backend.ReportDetail fRep = rep;
final Exception fError = error;
ui.post(() -> {
if (gen != generation || !detailOpen) return;
hideSpinner();
if (fError != null || fRep == null) {
status.setText(act.getString(R.string.reports_failed,
fError == null ? "" : trimErr(fError)));
return;
}
StringBuilder sb = new StringBuilder(fRep.summary);
if (!fRep.analyses.isEmpty()) {
sb.append("\n\n## ").append(act.getString(R.string.reports_analyses_title));
for (String a : fRep.analyses) sb.append("\n\n\n").append(a);
}
if (fRep.analysesFailed) {
sb.append("\n\n(").append(act.getString(R.string.reports_analyses_failed)).append(")");
}
if (fRep.photoAnalysis != null && !fRep.photoAnalysis.isEmpty()) {
sb.append("\n\n## ").append(act.getString(R.string.reports_photo_title));
sb.append("\n\n").append(fRep.photoAnalysis);
}
String text = sb.toString().trim();
if (text.isEmpty() && !fRep.hasResult) {
text = act.getString(R.string.reports_no_summary);
}
detailText.setText(renderMd(text));
status.setText("");
if (fRep.hasSheet) {
sheetButtonLabel = fRep.sheetPhotos >= 0
? act.getString(R.string.reports_sheet_button, fRep.sheetPhotos, fRep.sheetClusters)
: act.getString(R.string.reports_sheet_button_simple);
sheetButton.setText(sheetButtonLabel);
sheetButton.setVisibility(View.VISIBLE);
if (pendingAutoSheet) {
pendingAutoSheet = false;
onSheetButton();
}
}
});
});
}







private static String trimErr(Exception e) {
String m = e.getMessage();
if (m == null) m = e.getClass().getSimpleName();
return m.length() > 120? m.substring(0, 120): m;
}
}
