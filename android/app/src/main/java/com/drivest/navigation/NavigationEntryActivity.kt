package com.drivest.navigation

import android.content.Intent
import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity
import com.drivest.app.R
import com.google.android.material.button.MaterialButton

class NavigationEntryActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_navigation_entry)

        findViewById<MaterialButton>(R.id.openNavigationMapButton).setOnClickListener {
            startActivity(Intent(this, DestinationSearchActivity::class.java))
        }
    }
}
