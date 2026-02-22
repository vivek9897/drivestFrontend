package com.drivest.navigation

import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.drivest.app.databinding.ActivitySettingsBinding
import com.drivest.navigation.settings.PreferredUnitsSetting
import com.drivest.navigation.settings.SettingsRepository
import com.drivest.navigation.settings.VoiceModeSetting
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.launch

class SettingsActivity : AppCompatActivity() {

    private lateinit var binding: ActivitySettingsBinding
    private lateinit var settingsRepository: SettingsRepository

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivitySettingsBinding.inflate(layoutInflater)
        setContentView(binding.root)

        settingsRepository = SettingsRepository(applicationContext)
        observeSettings()
        bindListeners()
    }

    private fun observeSettings() {
        lifecycleScope.launch {
            combine(
                settingsRepository.voiceMode,
                settingsRepository.preferredUnits
            ) { voice, units -> voice to units }
                .collectLatest { (voiceMode, unitsMode) ->
                    renderVoiceMode(voiceMode)
                    renderUnits(unitsMode)
                }
        }
    }

    private fun bindListeners() {
        binding.voiceModeRadioGroup.setOnCheckedChangeListener { _, checkedId ->
            lifecycleScope.launch {
                when (checkedId) {
                    com.drivest.app.R.id.voiceModeAllRadio -> settingsRepository.setVoiceMode(VoiceModeSetting.ALL)
                    com.drivest.app.R.id.voiceModeAlertsRadio -> settingsRepository.setVoiceMode(VoiceModeSetting.ALERTS)
                    com.drivest.app.R.id.voiceModeMuteRadio -> settingsRepository.setVoiceMode(VoiceModeSetting.MUTE)
                }
            }
        }

        binding.unitsRadioGroup.setOnCheckedChangeListener { _, checkedId ->
            lifecycleScope.launch {
                when (checkedId) {
                    com.drivest.app.R.id.unitsMphRadio -> settingsRepository.setPreferredUnits(PreferredUnitsSetting.UK_MPH)
                    com.drivest.app.R.id.unitsKmhRadio -> settingsRepository.setPreferredUnits(PreferredUnitsSetting.METRIC_KMH)
                }
            }
        }
    }

    private fun renderVoiceMode(mode: VoiceModeSetting) {
        val targetId = when (mode) {
            VoiceModeSetting.ALL -> com.drivest.app.R.id.voiceModeAllRadio
            VoiceModeSetting.ALERTS -> com.drivest.app.R.id.voiceModeAlertsRadio
            VoiceModeSetting.MUTE -> com.drivest.app.R.id.voiceModeMuteRadio
        }
        if (binding.voiceModeRadioGroup.checkedRadioButtonId != targetId) {
            binding.voiceModeRadioGroup.check(targetId)
        }
    }

    private fun renderUnits(units: PreferredUnitsSetting) {
        val targetId = when (units) {
            PreferredUnitsSetting.UK_MPH -> com.drivest.app.R.id.unitsMphRadio
            PreferredUnitsSetting.METRIC_KMH -> com.drivest.app.R.id.unitsKmhRadio
        }
        if (binding.unitsRadioGroup.checkedRadioButtonId != targetId) {
            binding.unitsRadioGroup.check(targetId)
        }
    }
}
