package com.manifold.app;

import android.app.Activity;
import android.os.Bundle;

public class MainActivity extends Activity {
    static {
        System.loadLibrary("ManifoldMobile");
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Native code handles the UI
    }
}
