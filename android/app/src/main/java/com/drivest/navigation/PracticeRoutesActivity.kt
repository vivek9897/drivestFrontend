package com.drivest.navigation

import android.content.Intent
import android.os.Bundle
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.isVisible
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import com.drivest.app.R
import com.drivest.navigation.data.CentreRepository
import com.drivest.navigation.data.TestCentre
import com.drivest.app.databinding.ActivityPracticeRoutesBinding
import com.drivest.navigation.practice.AssetsPracticeRouteStore
import com.drivest.navigation.practice.PracticeRoute
import com.drivest.navigation.settings.SettingsRepository
import kotlinx.coroutines.launch

class PracticeRoutesActivity : AppCompatActivity() {

    private lateinit var binding: ActivityPracticeRoutesBinding
    private lateinit var routeAdapter: PracticeRouteAdapter

    private val centreRepository by lazy { CentreRepository(this) }
    private val routeStore by lazy { AssetsPracticeRouteStore(this) }
    private val settingsRepository by lazy { SettingsRepository(applicationContext) }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityPracticeRoutesBinding.inflate(layoutInflater)
        setContentView(binding.root)

        val centreId = intent.getStringExtra(AppFlow.EXTRA_CENTRE_ID).orEmpty()
        if (centreId.isBlank()) {
            Toast.makeText(this, getString(R.string.practice_routes_missing_centre), Toast.LENGTH_LONG).show()
            finish()
            return
        }

        val centre = centreRepository.findById(centreId)
        if (centre == null) {
            Toast.makeText(this, getString(R.string.practice_routes_unknown_centre), Toast.LENGTH_LONG).show()
            finish()
            return
        }

        routeAdapter = PracticeRouteAdapter { route ->
            openPracticeMap(centre, route)
        }

        binding.practiceRoutesRecyclerView.apply {
            layoutManager = LinearLayoutManager(this@PracticeRoutesActivity)
            adapter = routeAdapter
        }

        binding.practiceRoutesTitle.text = getString(R.string.practice_routes_title, centre.name)
        binding.practiceRoutesSubtitle.text = centre.address

        val routes = runCatching { routeStore.loadRoutesForCentre(centre.id) }
            .onFailure {
                Toast.makeText(
                    this,
                    getString(R.string.practice_routes_load_error),
                    Toast.LENGTH_LONG
                ).show()
            }
            .getOrDefault(emptyList())

        binding.emptyRoutesView.isVisible = routes.isEmpty()
        routeAdapter.submitList(routes)
    }

    private fun openPracticeMap(centre: TestCentre, route: PracticeRoute) {
        lifecycleScope.launch {
            settingsRepository.setLastSelectedCentreId(centre.id)
            settingsRepository.setLastMode(AppFlow.MODE_PRACTICE)
        }
        startActivity(
            Intent(this, MainActivity::class.java)
                .putExtra(AppFlow.EXTRA_APP_MODE, AppFlow.MODE_PRACTICE)
                .putExtra(AppFlow.EXTRA_CENTRE_ID, centre.id)
                .putExtra(AppFlow.EXTRA_ROUTE_ID, route.id)
        )
    }
}
