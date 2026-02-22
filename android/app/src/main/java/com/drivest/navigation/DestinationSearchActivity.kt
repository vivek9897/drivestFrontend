package com.drivest.navigation

import android.content.Intent
import android.os.Bundle
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.isVisible
import androidx.core.widget.doAfterTextChanged
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import com.drivest.app.R
import com.drivest.navigation.data.DestinationSuggestion
import com.drivest.navigation.data.MapboxSearchRepository
import com.drivest.app.databinding.ActivityDestinationSearchBinding
import com.drivest.navigation.settings.SettingsRepository
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

class DestinationSearchActivity : AppCompatActivity() {

    private lateinit var binding: ActivityDestinationSearchBinding
    private lateinit var suggestionAdapter: DestinationSuggestionAdapter
    private lateinit var searchRepository: MapboxSearchRepository
    private lateinit var settingsRepository: SettingsRepository
    private var searchJob: Job? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityDestinationSearchBinding.inflate(layoutInflater)
        setContentView(binding.root)

        searchRepository = MapboxSearchRepository(this)
        settingsRepository = SettingsRepository(applicationContext)
        suggestionAdapter = DestinationSuggestionAdapter(::onSuggestionSelected)

        binding.destinationRecyclerView.apply {
            layoutManager = LinearLayoutManager(this@DestinationSearchActivity)
            adapter = suggestionAdapter
        }

        binding.destinationSearchInput.doAfterTextChanged { editable ->
            val query = editable?.toString().orEmpty()
            runSearch(query)
        }

        binding.destinationSearchInput.requestFocus()
        binding.emptyDestinationsView.isVisible = true
    }

    private fun runSearch(query: String) {
        searchJob?.cancel()
        searchJob = lifecycleScope.launch {
            val trimmed = query.trim()
            if (trimmed.length < 2) {
                suggestionAdapter.submitList(emptyList())
                binding.emptyDestinationsView.text = getString(R.string.destination_search_min_chars)
                binding.emptyDestinationsView.isVisible = true
                return@launch
            }

            delay(250L)
            binding.destinationProgress.isVisible = true

            val suggestions = searchRepository.searchDestinations(trimmed)
            binding.destinationProgress.isVisible = false

            suggestionAdapter.submitList(suggestions)
            binding.emptyDestinationsView.isVisible = suggestions.isEmpty()
            binding.emptyDestinationsView.text = getString(R.string.destination_search_empty)
        }
    }

    private fun onSuggestionSelected(suggestion: DestinationSuggestion) {
        val token = getString(R.string.mapbox_access_token).trim()
        if (token == "YOUR_PUBLIC_MAPBOX_ACCESS_TOKEN") {
            Toast.makeText(this, getString(R.string.destination_search_missing_token), Toast.LENGTH_LONG).show()
            return
        }

        lifecycleScope.launch {
            settingsRepository.setLastMode(AppFlow.MODE_NAV)
        }
        startActivity(
            Intent(this, MainActivity::class.java)
                .putExtra(AppFlow.EXTRA_APP_MODE, AppFlow.MODE_NAV)
                .putExtra(AppFlow.EXTRA_DESTINATION_LAT, suggestion.lat)
                .putExtra(AppFlow.EXTRA_DESTINATION_LON, suggestion.lon)
                .putExtra(AppFlow.EXTRA_DESTINATION_NAME, suggestion.placeName)
        )
    }
}
