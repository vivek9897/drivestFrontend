package com.drivest.navigation

import android.content.Intent
import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.drivest.app.R
import com.drivest.navigation.settings.SettingsRepository
import com.google.android.material.button.MaterialButton
import kotlinx.coroutines.launch

class HomeActivity : AppCompatActivity() {

    private val settingsRepository by lazy { SettingsRepository(applicationContext) }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_home)

        findViewById<MaterialButton>(R.id.practiceModeButton).setOnClickListener {
            lifecycleScope.launch {
                settingsRepository.setLastMode(AppFlow.MODE_PRACTICE)
            }
            startActivity(Intent(this, PracticeEntryActivity::class.java))
        }

        findViewById<MaterialButton>(R.id.navigationModeButton).setOnClickListener {
            lifecycleScope.launch {
                settingsRepository.setLastMode(AppFlow.MODE_NAV)
            }
            startActivity(Intent(this, NavigationEntryActivity::class.java))
        }

        findViewById<MaterialButton>(R.id.homeSettingsButton).setOnClickListener {
            startActivity(Intent(this, SettingsActivity::class.java))
        }
    }
}
