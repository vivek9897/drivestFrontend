package com.drivest.navigation

import android.content.Intent
import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity
import com.drivest.app.R
import com.google.android.material.button.MaterialButton

class PracticeEntryActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_practice_entry)

        findViewById<MaterialButton>(R.id.openPracticeMapButton).setOnClickListener {
            startActivity(Intent(this, CentrePickerActivity::class.java))
        }
    }
}
