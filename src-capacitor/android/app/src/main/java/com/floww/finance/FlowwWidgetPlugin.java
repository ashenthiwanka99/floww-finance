package com.floww.finance;

import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "FlowwWidget")
public class FlowwWidgetPlugin extends Plugin {

    @PluginMethod
    public void updateWidget(PluginCall call) {
        Context context = getContext();
        AppWidgetManager manager = AppWidgetManager.getInstance(context);

        String snapshot = call.getString("snapshot");
        if (snapshot != null) {
            WidgetHelper.saveSnapshot(context, snapshot);
        }

        // Refresh all 3 widget types
        refreshWidget(context, manager, FlowwWidgetProvider.class);
        refreshWidget(context, manager, SmallBudgetWidget.class);
        refreshWidget(context, manager, SmallSpendingWidget.class);

        call.resolve();
    }

    private void refreshWidget(Context context, AppWidgetManager manager, Class<?> widgetClass) {
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, widgetClass));
        if (ids != null && ids.length > 0) {
            Intent intent = new Intent(context, widgetClass);
            intent.setAction(AppWidgetManager.ACTION_APPWIDGET_UPDATE);
            intent.putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids);
            context.sendBroadcast(intent);
        }
    }
}
