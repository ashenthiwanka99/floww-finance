package com.floww.finance;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.widget.RemoteViews;

import org.json.JSONObject;

public class SmallSpendingWidget extends AppWidgetProvider {

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        JSONObject s = WidgetHelper.snapshot(context);
        for (int id : ids) {
            manager.updateAppWidget(id, render(context, s));
        }
    }

    private RemoteViews render(Context context, JSONObject s) {
        RemoteViews v = new RemoteViews(context.getPackageName(), R.layout.widget_small_spending);
        v.setOnClickPendingIntent(android.R.id.background, WidgetHelper.openApp(context, 2));
        v.setTextViewText(R.id.wss_days, WidgetHelper.daysLeft(s));

        if (s == null) {
            v.setTextViewText(R.id.wss_spent, "-");
            WidgetHelper.textColor(context, v, R.id.wss_spent, R.color.widget_text_muted);
            v.setTextViewText(R.id.wss_top_label, "Open Floww to load");
            v.setTextViewText(R.id.wss_top_amount, "");
            v.setTextViewText(R.id.wss_unpaid_label, "");
            v.setTextViewText(R.id.wss_unpaid_amount, "");
            return v;
        }

        String spent = WidgetHelper.text(s, "spent");
        v.setTextViewText(R.id.wss_spent, spent);
        WidgetHelper.textColor(context, v, R.id.wss_spent,
            "0".equals(spent) ? R.color.widget_text_muted : R.color.widget_text);

        JSONObject top = s.optJSONObject("top");
        v.setTextViewText(R.id.wss_top_label, top == null ? "No spending yet" : "Most on " + WidgetHelper.text(top, "label"));
        v.setTextViewText(R.id.wss_top_amount, top == null ? "" : WidgetHelper.text(top, "amount"));

        int count = s.optInt("dueCount");
        v.setTextViewText(R.id.wss_unpaid_label, count > 0 ? count + " unpaid" : "Nothing unpaid");
        v.setTextViewText(R.id.wss_unpaid_amount, count > 0 ? WidgetHelper.text(s, "due") : "");
        return v;
    }
}
