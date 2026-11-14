package com.floww.finance;

import android.content.res.Configuration;
import android.os.Bundle;

import androidx.core.content.ContextCompat;

import com.getcapacitor.BridgeActivity;

import org.json.JSONObject;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(FlowwWidgetPlugin.class);
        registerPlugin(SmsInboxPlugin.class);
        super.onCreate(savedInstanceState);
        getBridge().getWebView().setBackgroundColor(
            ContextCompat.getColor(this, startsDark() ? R.color.ground_dark : R.color.ground_light));
    }

    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        if (getBridge() != null) {
            getBridge().triggerWindowJSEvent("flowwsystemtheme", "{ \"dark\": " + isNight(newConfig) + " }");
        }
    }

    private boolean startsDark() {
        String mode = "system";
        try {
            String json = getSharedPreferences("CapacitorStorage", MODE_PRIVATE).getString("settings", null);
            if (json != null) mode = new JSONObject(json).optString("themeMode", "system");
        } catch (Exception ignored) {
        }
        if ("dark".equals(mode)) return true;
        if ("light".equals(mode)) return false;
        return isNight(getResources().getConfiguration());
    }

    private static boolean isNight(Configuration config) {
        return (config.uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
    }
}
