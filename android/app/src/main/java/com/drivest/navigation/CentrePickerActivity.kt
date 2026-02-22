package com.drivest.navigation

import android.content.Intent
import android.os.Bundle
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.isVisible
import androidx.core.widget.doAfterTextChanged
import androidx.recyclerview.widget.LinearLayoutManager
import com.drivest.app.R
import com.drivest.navigation.data.CentreRepository
import com.drivest.navigation.data.TestCentre
import com.drivest.app.databinding.ActivityCentrePickerBinding

class CentrePickerActivity : AppCompatActivity() {

    private lateinit var binding: ActivityCentrePickerBinding
    private lateinit var centreAdapter: CentreAdapter
    private lateinit var centreRepository: CentreRepository
    private var allCentres: List<TestCentre> = emptyList()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityCentrePickerBinding.inflate(layoutInflater)
        setContentView(binding.root)

        centreRepository = CentreRepository(this)
        centreAdapter = CentreAdapter(::onCentreSelected)

        binding.centreRecyclerView.apply {
            layoutManager = LinearLayoutManager(this@CentrePickerActivity)
            adapter = centreAdapter
        }

        binding.centreSearchInput.doAfterTextChanged { editable ->
            filterCentres(editable?.toString().orEmpty())
        }

        loadCentres()
    }

    private fun loadCentres() {
        allCentres = runCatching { centreRepository.loadCentres() }
            .onFailure {
                Toast.makeText(
                    this,
                    getString(R.string.centre_picker_load_error),
                    Toast.LENGTH_LONG
                ).show()
            }
            .getOrDefault(emptyList())

        filterCentres(binding.centreSearchInput.text?.toString().orEmpty())
    }

    private fun filterCentres(rawQuery: String) {
        val query = rawQuery.trim().lowercase()
        val filtered = if (query.isBlank()) {
            allCentres
        } else {
            allCentres.filter { centre ->
                centre.name.lowercase().contains(query) ||
                    centre.address.lowercase().contains(query)
            }
        }

        binding.emptyCentresView.isVisible = filtered.isEmpty()
        centreAdapter.submitList(filtered)
    }

    private fun onCentreSelected(centre: TestCentre) {
        startActivity(
            Intent(this, PracticeRoutesActivity::class.java)
                .putExtra(AppFlow.EXTRA_CENTRE_ID, centre.id)
        )
    }
}
