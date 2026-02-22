package com.drivest.navigation

import android.Manifest
import android.annotation.SuppressLint
import android.content.Intent
import android.content.pm.PackageManager
import android.content.res.Resources
import android.os.Build
import android.os.Bundle
import android.util.Log
import android.widget.Toast
import androidx.activity.viewModels
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.constraintlayout.widget.ConstraintLayout
import androidx.core.content.ContextCompat
import androidx.core.view.isVisible
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.updateLayoutParams
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.repeatOnLifecycle
import com.drivest.app.R
import com.mapbox.api.directions.v5.models.RouteOptions
import com.mapbox.api.directions.v5.models.VoiceInstructions
import com.mapbox.common.location.Location
import com.mapbox.geojson.LineString
import com.mapbox.geojson.Point
import com.mapbox.maps.ImageHolder
import com.mapbox.maps.CameraOptions
import com.mapbox.maps.EdgeInsets
import com.mapbox.maps.plugin.annotation.annotations
import com.mapbox.maps.plugin.annotation.generated.PointAnnotation
import com.mapbox.maps.plugin.annotation.generated.PointAnnotationManager
import com.mapbox.maps.plugin.annotation.generated.PointAnnotationOptions
import com.mapbox.maps.plugin.annotation.generated.createPointAnnotationManager
import com.mapbox.maps.plugin.animation.MapAnimationOptions
import com.mapbox.maps.plugin.animation.camera
import com.mapbox.maps.plugin.gestures.OnMapClickListener
import com.mapbox.maps.plugin.gestures.gestures
import com.mapbox.maps.plugin.LocationPuck2D
import com.mapbox.maps.plugin.locationcomponent.location
import com.mapbox.maps.plugin.compass.compass
import com.mapbox.navigation.base.ExperimentalPreviewMapboxNavigationAPI
import com.mapbox.navigation.base.TimeFormat
import com.mapbox.navigation.base.extensions.applyDefaultNavigationOptions
import com.mapbox.navigation.base.extensions.applyLanguageAndVoiceUnitOptions
import com.mapbox.navigation.base.formatter.DistanceFormatterOptions
import com.mapbox.navigation.base.options.NavigationOptions
import com.mapbox.navigation.base.route.NavigationRoute
import com.mapbox.navigation.base.route.NavigationRouterCallback
import com.mapbox.navigation.base.route.RouteAlternativesOptions
import com.mapbox.navigation.base.route.RouterFailure
import com.mapbox.navigation.base.route.RouterOrigin
import com.mapbox.navigation.base.speed.model.SpeedUnit
import com.mapbox.navigation.core.MapboxNavigation
import com.mapbox.navigation.core.directions.session.RoutesObserver
import com.mapbox.navigation.core.formatter.MapboxDistanceFormatter
import com.mapbox.navigation.core.lifecycle.MapboxNavigationApp
import com.mapbox.navigation.core.lifecycle.MapboxNavigationObserver
import com.mapbox.navigation.core.lifecycle.requireMapboxNavigation
import com.mapbox.navigation.core.replay.route.ReplayProgressObserver
import com.mapbox.navigation.core.replay.route.ReplayRouteMapper
import com.mapbox.navigation.core.trip.session.LocationMatcherResult
import com.mapbox.navigation.core.trip.session.LocationObserver
import com.mapbox.navigation.core.trip.session.RouteProgressObserver
import com.mapbox.navigation.core.trip.session.VoiceInstructionsObserver
import com.drivest.navigation.data.CentreRepository
import com.drivest.navigation.data.TestCentre
import com.drivest.app.databinding.ActivityMainBinding
import com.drivest.navigation.practice.AssetsPracticeRouteStore
import com.drivest.navigation.practice.PracticeRoute
import com.drivest.navigation.practice.PracticeRouteStore
import com.drivest.navigation.settings.PreferredUnitsSetting
import com.drivest.navigation.settings.SettingsRepository
import com.drivest.navigation.settings.VoiceModeSetting
import com.drivest.navigation.session.NavigationSessionManager
import com.mapbox.navigation.tripdata.maneuver.api.MapboxManeuverApi
import com.mapbox.navigation.tripdata.progress.api.MapboxTripProgressApi
import com.mapbox.navigation.tripdata.progress.model.DistanceRemainingFormatter
import com.mapbox.navigation.tripdata.progress.model.EstimatedTimeToArrivalFormatter
import com.mapbox.navigation.tripdata.progress.model.PercentDistanceTraveledFormatter
import com.mapbox.navigation.tripdata.progress.model.TimeRemainingFormatter
import com.mapbox.navigation.tripdata.progress.model.TripProgressUpdateFormatter
import com.mapbox.navigation.tripdata.shield.model.RouteShieldCallback
import com.mapbox.navigation.tripdata.speedlimit.api.MapboxSpeedInfoApi
import com.mapbox.navigation.tripdata.speedlimit.model.SpeedInfoValue
import com.mapbox.navigation.ui.base.util.MapboxNavigationConsumer
import com.mapbox.navigation.ui.maps.NavigationStyles
import com.mapbox.navigation.ui.maps.location.NavigationLocationProvider
import com.mapbox.navigation.ui.maps.route.line.MapboxRouteLineApiExtensions.setNavigationRoutes
import com.mapbox.navigation.ui.maps.route.line.MapboxRouteLineApiExtensions.updateWithRouteProgress
import com.mapbox.navigation.ui.maps.route.line.api.MapboxRouteLineApi
import com.mapbox.navigation.ui.maps.route.line.api.MapboxRouteLineView
import com.mapbox.navigation.ui.maps.route.line.model.MapboxRouteLineApiOptions
import com.mapbox.navigation.ui.maps.route.line.model.MapboxRouteLineViewOptions
import com.mapbox.navigation.voice.api.MapboxSpeechApi
import com.mapbox.navigation.voice.api.MapboxVoiceInstructionsPlayer
import com.mapbox.navigation.voice.model.SpeechAnnouncement
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.combine
import kotlin.coroutines.resume
import kotlinx.coroutines.suspendCancellableCoroutine
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.concurrent.TimeUnit
import kotlin.math.asin
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt
import kotlin.math.sin
import kotlin.math.sqrt

@OptIn(ExperimentalPreviewMapboxNavigationAPI::class)
class MainActivity : AppCompatActivity() {

    private val mainViewModel: MainViewModel by viewModels()

    private enum class VoiceGuidanceMode {
        FULL,
        ALERTS_ONLY,
        MUTE
    }

    private enum class UiMode {
        PRACTICE,
        NAVIGATION
    }

    private enum class NavSessionState {
        BROWSE,
        PREVIEW,
        ACTIVE
    }

    private enum class PracticeRunStage {
        IDLE,
        APPROACHING_START,
        ROUTE_ACTIVE
    }

    private val routeClickPadding = 30 * Resources.getSystem().displayMetrics.density
    private val alertsOnlyDistanceMeters = 120.0
    private val duplicateVoiceWindowMs = 5_000L
    private val practiceStartMatchRadiusMeters = 60.0
    private val practiceApproachArrivalMeters = 75.0
    private val practiceRouteFinishMeters = 45.0
    private val practiceRouteFinishPercent = 98

    private val defaultTestCentreId = "colchester"
    private val defaultTestCentreLabel = "Colchester"
    private val fallbackTestCentrePoint = Point.fromLngLat(0.928174, 51.872116)

    private lateinit var binding: ActivityMainBinding
    private var latestStatusBarInsetPx: Int = 0
    private var voiceGuidanceMode: VoiceGuidanceMode = VoiceGuidanceMode.FULL
    private var uiMode: UiMode = UiMode.PRACTICE
    private var navSessionState: NavSessionState = NavSessionState.BROWSE
    private var selectedCentreId: String = defaultTestCentreId
    private var selectedRouteId: String? = null
    private var selectedCentre: TestCentre? = null
    private var selectedDestinationPoint: Point? = null
    private var selectedDestinationName: String? = null
    private var selectedPracticeNavigationRoute: NavigationRoute? = null
    private var practiceStartPoint: Point? = null
    private var practiceRunStage: PracticeRunStage = PracticeRunStage.IDLE
    private var isPracticeRouteLoading: Boolean = false
    private var latestEnhancedLocationPoint: Point? = null
    private var latestSpeedMetersPerSecond: Double = 0.0
    private var latestDistanceToManeuverMeters: Double = Double.MAX_VALUE
    private var lastCameraZoom: Double = 15.0
    private var lastCameraPitch: Double = 45.0
    private var styleLoaded = false
    private var destinationAnnotationManager: PointAnnotationManager? = null
    private var destinationAnnotation: PointAnnotation? = null
    private var pendingDestinationPreview = false
    private var lastSpokenAnnouncement: String? = null
    private var lastSpokenAtMs: Long = 0L

    private val navigationLocationProvider = NavigationLocationProvider()
    private val centreRepository by lazy { CentreRepository(this) }
    private val practiceRouteStore: PracticeRouteStore by lazy { AssetsPracticeRouteStore(this) }
    private val settingsRepository by lazy { SettingsRepository(applicationContext) }
    private var preferredUnitsSetting: PreferredUnitsSetting = PreferredUnitsSetting.UK_MPH
    private val replayRouteMapper = ReplayRouteMapper()
    private val replayEnabled: Boolean by lazy { isLikelyEmulator() }

    private val routeLineViewOptions: MapboxRouteLineViewOptions by lazy {
        MapboxRouteLineViewOptions.Builder(this)
            .routeLineBelowLayerId("road-label-navigation")
            .build()
    }

    private val routeLineApiOptions: MapboxRouteLineApiOptions by lazy {
        MapboxRouteLineApiOptions.Builder()
            .vanishingRouteLineEnabled(true)
            .build()
    }

    private val routeLineView by lazy {
        MapboxRouteLineView(routeLineViewOptions)
    }

    private val routeLineApi: MapboxRouteLineApi by lazy {
        MapboxRouteLineApi(routeLineApiOptions)
    }

    private val formatterOptions: DistanceFormatterOptions by lazy {
        DistanceFormatterOptions.Builder(applicationContext).build()
    }

    private val maneuverApi: MapboxManeuverApi by lazy {
        MapboxManeuverApi(MapboxDistanceFormatter(formatterOptions))
    }

    private val tripProgressFormatter: TripProgressUpdateFormatter by lazy {
        TripProgressUpdateFormatter.Builder(this)
            .distanceRemainingFormatter(DistanceRemainingFormatter(formatterOptions))
            .timeRemainingFormatter(TimeRemainingFormatter(this))
            .percentRouteTraveledFormatter(PercentDistanceTraveledFormatter())
            .estimatedTimeToArrivalFormatter(EstimatedTimeToArrivalFormatter(this, TimeFormat.NONE_SPECIFIED))
            .build()
    }

    private val tripProgressApi: MapboxTripProgressApi by lazy {
        MapboxTripProgressApi(tripProgressFormatter)
    }

    private val roadShieldCallback =
        RouteShieldCallback { shields -> binding.maneuverView.renderManeuverWith(shields) }

    private val speedInfoApi: MapboxSpeedInfoApi by lazy {
        MapboxSpeedInfoApi()
    }

    private val voiceLanguageTag: String = Locale.UK.toLanguageTag()

    private val speechApi: MapboxSpeechApi by lazy {
        MapboxSpeechApi(this, voiceLanguageTag)
    }

    private val voiceInstructionsPlayer: MapboxVoiceInstructionsPlayer by lazy {
        MapboxVoiceInstructionsPlayer(this, voiceLanguageTag)
    }

    private val voiceInstructionsPlayerCallback =
        MapboxNavigationConsumer<SpeechAnnouncement> { announcement ->
            speechApi.clean(announcement)
        }

    private val voiceInstructionsObserver = VoiceInstructionsObserver { voiceInstructions ->
        if (!shouldSpeakVoiceInstruction(voiceInstructions)) {
            return@VoiceInstructionsObserver
        }
        if (isDuplicateVoiceInstruction(voiceInstructions)) {
            return@VoiceInstructionsObserver
        }

        speechApi.generate(voiceInstructions) { speechResult ->
            speechResult.fold(
                { speechError ->
                    voiceInstructionsPlayer.play(speechError.fallback, voiceInstructionsPlayerCallback)
                },
                { speechValue ->
                    voiceInstructionsPlayer.play(speechValue.announcement, voiceInstructionsPlayerCallback)
                }
            )
        }
    }

    private lateinit var sessionManager: NavigationSessionManager

    private val locationObserver: LocationObserver = object : LocationObserver {
        override fun onNewRawLocation(rawLocation: Location) {
            // Raw location is not used for rendering.
        }

        override fun onNewLocationMatcherResult(locationMatcherResult: LocationMatcherResult) {
            val enhancedLocation = locationMatcherResult.enhancedLocation
            latestSpeedMetersPerSecond = (enhancedLocation.speed ?: 0.0).coerceAtLeast(0.0)
            latestEnhancedLocationPoint = Point.fromLngLat(enhancedLocation.longitude, enhancedLocation.latitude)
            navigationLocationProvider.changePosition(enhancedLocation, locationMatcherResult.keyPoints)
            updateCamera(
                latestEnhancedLocationPoint ?: fallbackTestCentrePoint,
                enhancedLocation.bearing,
                latestSpeedMetersPerSecond
            )

            val speedInfo = speedInfoApi.updatePostedAndCurrentSpeed(
                locationMatcherResult,
                formatterOptions
            )
            renderSpeedometer(speedInfo)
        }
    }

    private val routesObserver = RoutesObserver { result ->
        lifecycleScope.launch {
            routeLineApi.setNavigationRoutes(
                newRoutes = result.navigationRoutes,
                alternativeRoutesMetadata = mapboxNavigation.getAlternativeMetadataFor(result.navigationRoutes)
            ).apply {
                binding.mapView.mapboxMap.style?.let { style ->
                    routeLineView.renderRouteDrawData(style, this)
                }
            }

            if (uiMode == UiMode.NAVIGATION && navSessionState == NavSessionState.PREVIEW) {
                updatePreviewSummaryFromRoutes(result.navigationRoutes)
            }

            val isActiveSession =
                mainViewModel.uiState.value.sessionState == NavigationSessionManager.SessionState.ACTIVE
            if (replayEnabled && isActiveSession && result.navigationRoutes.isNotEmpty()) {
                syncReplayToRoute(result.navigationRoutes.first())
            }
        }
    }

    private val routeProgressObserver = RouteProgressObserver { progress ->
        lifecycleScope.launch {
            val routeLineUpdate = routeLineApi.updateWithRouteProgress(progress)
            binding.mapView.mapboxMap.style?.let { style ->
                routeLineView.renderRouteLineUpdate(style, routeLineUpdate)
            }
        }

        val maneuvers = maneuverApi.getManeuvers(progress)
        maneuvers.fold(
            {
                // Ignore maneuver formatting errors for now.
            },
            {
                maneuvers.onValue { maneuverList ->
                    maneuverApi.getRoadShields(maneuverList, roadShieldCallback)
                }
                binding.maneuverView.isVisible = true
                binding.maneuverView.renderManeuvers(maneuvers)
                updateTopOrnamentsPosition()
            }
        )

        val tripProgress = tripProgressApi.getTripProgress(progress)
        latestDistanceToManeuverMeters =
            progress.currentLegProgress?.currentStepProgress?.distanceRemaining?.toDouble()
                ?: Double.MAX_VALUE
        val formatter = tripProgress.formatter
        val completionPercent = normalizedCompletionPercent(tripProgress.percentRouteTraveled.toDouble())

        binding.routeProgressBanner.isVisible = true
        binding.routeDistanceLeftValue.text = formatter.getDistanceRemaining(tripProgress.distanceRemaining)
        binding.routeTimeLeftValue.text = formatter.getTimeRemaining(tripProgress.totalTimeRemaining)
        binding.routeEtaValue.text = formatter.getEstimatedTimeToArrival(
            tripProgress.estimatedTimeToArrival,
            tripProgress.arrivalTimeZone
        )
        binding.routeCompletedValue.text = "$completionPercent%"
        binding.routeProgressBar.progress = completionPercent

        handlePracticeRunProgress(
            distanceRemainingMeters = tripProgress.distanceRemaining,
            completionPercent = completionPercent
        )
    }

    private val mapClickListener = OnMapClickListener { point ->
        lifecycleScope.launch {
            routeLineApi.findClosestRoute(point, binding.mapView.mapboxMap, routeClickPadding) {
                val routeFound = it.value?.navigationRoute
                if (routeFound != null && routeFound != routeLineApi.getPrimaryNavigationRoute()) {
                    val reorderedRoutes = routeLineApi.getNavigationRoutes()
                        .filter { navigationRoute -> navigationRoute != routeFound }
                        .toMutableList()
                        .also { list -> list.add(0, routeFound) }

                    mapboxNavigation.setNavigationRoutes(reorderedRoutes)
                }
            }
        }
        false
    }

    private val mapboxNavigation: MapboxNavigation by requireMapboxNavigation(
        onResumedObserver = object : MapboxNavigationObserver {
            @SuppressLint("MissingPermission")
            override fun onAttached(mapboxNavigation: MapboxNavigation) {
                mapboxNavigation.registerLocationObserver(locationObserver)
                mapboxNavigation.registerRoutesObserver(routesObserver)
                if (replayEnabled) {
                    mapboxNavigation.startReplayTripSession()
                    Log.d(TAG, "Replay trip session enabled (emulator mode).")
                } else {
                    mapboxNavigation.mapboxReplayer.stop()
                    mapboxNavigation.startTripSession()
                    Log.d(TAG, "Real GPS trip session enabled (device mode).")
                }
            }

            override fun onDetached(mapboxNavigation: MapboxNavigation) {
                if (::sessionManager.isInitialized) {
                    sessionManager.stop()
                }
                if (uiMode == UiMode.PRACTICE) {
                    resetPracticeRunState()
                }
                mapboxNavigation.unregisterLocationObserver(locationObserver)
                mapboxNavigation.unregisterRoutesObserver(routesObserver)
                speechApi.cancel()
                voiceInstructionsPlayer.clear()
                renderSpeedometer(null)
                mapboxNavigation.mapboxReplayer.stop()
            }
        },
        onInitialize = this::initNavigation
    )

    private val locationPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { grants ->
        val granted = grants[Manifest.permission.ACCESS_FINE_LOCATION] == true ||
            grants[Manifest.permission.ACCESS_COARSE_LOCATION] == true

        if (!granted) {
            Toast.makeText(
                this,
                "Location permission is required for navigation.",
                Toast.LENGTH_LONG
            ).show()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)
        uiMode = resolveUiModeFromIntent()
        resolveSessionSelection()
        mainViewModel.setMode(
            if (uiMode == UiMode.NAVIGATION) AppFlow.MODE_NAV else AppFlow.MODE_PRACTICE
        )
        mainViewModel.setCentre(selectedCentreId)
        mainViewModel.setRoute(selectedRouteId)
        mainViewModel.setDestination(
            selectedDestinationPoint?.let { destination ->
                DestinationUiState(
                    lat = destination.latitude(),
                    lon = destination.longitude(),
                    name = selectedDestinationName
                )
            }
        )

        observeUiState()
        observeSettings()
        lifecycleScope.launch {
            settingsRepository.setLastSelectedCentreId(selectedCentreId)
            settingsRepository.setLastMode(
                if (uiMode == UiMode.NAVIGATION) AppFlow.MODE_NAV else AppFlow.MODE_PRACTICE
            )
        }
        binding.maneuverView.addOnLayoutChangeListener { _, _, _, _, _, _, _, _, _ ->
            updateTopOrnamentsPosition()
        }
        applySystemBarInsets()
        renderVoiceGuidanceMode()
        applyUiModeState()

        binding.mapView.mapboxMap.loadStyle(NavigationStyles.NAVIGATION_DAY_STYLE) {
            styleLoaded = true
            destinationAnnotationManager = binding.mapView.annotations.createPointAnnotationManager()
            binding.mapView.mapboxMap.setCamera(
                CameraOptions.Builder()
                    .center(initialCameraCenter())
                    .zoom(12.5)
                    .build()
            )
            updateTopOrnamentsPosition()
            renderDestinationMarker()
            if (
                uiMode == UiMode.NAVIGATION &&
                selectedDestinationPoint != null &&
                mainViewModel.uiState.value.sessionState == NavigationSessionManager.SessionState.BROWSE
            ) {
                if (::sessionManager.isInitialized) {
                    sessionManager.previewDestination(selectedDestinationPoint!!)
                } else {
                    pendingDestinationPreview = true
                }
            }
        }
        binding.mapView.gestures.addOnMapClickListener(mapClickListener)
        binding.compassButton.setOnClickListener {
            resetCameraBearingToNorth()
        }
        binding.voiceModeButton.setOnClickListener {
            cycleVoiceGuidanceMode()
        }
        binding.overviewButton.setOnClickListener {
            showRouteOverview()
        }
        binding.settingsButton.setOnClickListener {
            startActivity(Intent(this, SettingsActivity::class.java))
        }
        binding.stopNavigationButton.setOnClickListener {
            stopNavigationSession()
        }

        binding.startNavigation.setOnClickListener {
            if (!hasLocationPermission()) {
                requestLocationPermission()
                return@setOnClickListener
            }

            when (uiMode) {
                UiMode.PRACTICE -> generatePracticeRoutes()
                UiMode.NAVIGATION -> handleNavigationPrimaryAction()
            }
        }

        if (!hasLocationPermission()) {
            requestLocationPermission()
        }
    }

    override fun onStart() {
        super.onStart()
        ensureSessionManager()
        if (pendingDestinationPreview && selectedDestinationPoint != null) {
            sessionManager.previewDestination(selectedDestinationPoint!!)
            pendingDestinationPreview = false
        }
    }

    private fun ensureSessionManager() {
        if (::sessionManager.isInitialized) return
        sessionManager = NavigationSessionManager(
            mapboxNavigation = mapboxNavigation,
            routeProgressObserver = routeProgressObserver,
            voiceInstructionsObserver = voiceInstructionsObserver,
            createReplayObserver = if (replayEnabled) {
                { ReplayProgressObserver(mapboxNavigation.mapboxReplayer) }
            } else {
                null
            },
            clearVoiceQueue = {
                speechApi.cancel()
                voiceInstructionsPlayer.clear()
            },
            onStateChanged = { state ->
                mainViewModel.setSessionState(state)
                if (uiMode == UiMode.NAVIGATION) {
                    navSessionState = toNavSessionState(state)
                }
                applyUiModeState()
            },
            onPreviewPracticeRoute = { /* MainActivity drives practice preview generation. */ },
            onPreviewDestination = { destination ->
                selectedDestinationPoint = destination
                renderDestinationMarker()
                previewNavigationToDestination()
            }
        )
        sessionManager.init(this, binding.mapView)
        sessionManager.setMode(
            if (uiMode == UiMode.NAVIGATION) {
                NavigationSessionManager.Mode.NAVIGATION
            } else {
                NavigationSessionManager.Mode.PRACTICE
            }
        )
    }

    private fun applySystemBarInsets() {
        val topGapPx = (8f * resources.displayMetrics.density).toInt()
        val bottomGapPx = (16f * resources.displayMetrics.density).toInt()

        ViewCompat.setOnApplyWindowInsetsListener(binding.root) { _, insets ->
            val topInset = insets.getInsets(WindowInsetsCompat.Type.statusBars()).top
            latestStatusBarInsetPx = topInset
            binding.maneuverView.updateLayoutParams<ConstraintLayout.LayoutParams> {
                topMargin = topInset + topGapPx
            }

            val bottomInset = insets.getInsets(WindowInsetsCompat.Type.navigationBars()).bottom
            binding.startNavigation.updateLayoutParams<ConstraintLayout.LayoutParams> {
                bottomMargin = bottomInset + bottomGapPx
            }
            binding.stopNavigationButton.updateLayoutParams<ConstraintLayout.LayoutParams> {
                bottomMargin = bottomInset + (8f * resources.displayMetrics.density).toInt()
            }

            updateTopOrnamentsPosition()
            insets
        }
        ViewCompat.requestApplyInsets(binding.root)
    }

    private fun updateTopOrnamentsPosition() {
        binding.mapView.post {
            binding.mapView.compass.apply {
                enabled = false
                visibility = false
            }
        }
    }

    private fun resolveUiModeFromIntent(): UiMode {
        return when (intent.getStringExtra(AppFlow.EXTRA_APP_MODE)) {
            AppFlow.MODE_NAV -> UiMode.NAVIGATION
            else -> UiMode.PRACTICE
        }
    }

    private fun resolveSessionSelection() {
        selectedRouteId = intent.getStringExtra(AppFlow.EXTRA_ROUTE_ID)?.takeIf { it.isNotBlank() }

        val requestedCentreId = intent.getStringExtra(AppFlow.EXTRA_CENTRE_ID)?.trim().orEmpty()
        selectedCentreId = requestedCentreId.ifBlank { defaultTestCentreId }
        selectedCentre = runCatching { centreRepository.findById(selectedCentreId) }.getOrNull()

        if (selectedCentre == null && selectedCentreId != defaultTestCentreId) {
            selectedCentreId = defaultTestCentreId
            selectedCentre = runCatching { centreRepository.findById(selectedCentreId) }.getOrNull()
        }

        val hasDestination =
            intent.hasExtra(AppFlow.EXTRA_DESTINATION_LAT) && intent.hasExtra(AppFlow.EXTRA_DESTINATION_LON)
        if (hasDestination) {
            val lat = intent.getDoubleExtra(AppFlow.EXTRA_DESTINATION_LAT, Double.NaN)
            val lon = intent.getDoubleExtra(AppFlow.EXTRA_DESTINATION_LON, Double.NaN)
            if (lat.isFinite() && lon.isFinite()) {
                selectedDestinationPoint = Point.fromLngLat(lon, lat)
                selectedDestinationName = intent.getStringExtra(AppFlow.EXTRA_DESTINATION_NAME)
                    ?.takeIf { it.isNotBlank() }
                navSessionState = NavSessionState.BROWSE
            }
        }
    }

    private fun applyUiModeState() {
        binding.startNavigation.text = when (uiMode) {
            UiMode.PRACTICE -> when (practiceRunStage) {
                PracticeRunStage.IDLE -> getString(
                    R.string.start_navigation_practice_centre,
                    selectedCentreLabel()
                )
                PracticeRunStage.APPROACHING_START -> getString(R.string.practice_approaching_start)
                PracticeRunStage.ROUTE_ACTIVE -> getString(R.string.practice_route_active)
            }
            UiMode.NAVIGATION -> when (navSessionState) {
                NavSessionState.ACTIVE -> getString(R.string.start_navigation_nav_preview)
                NavSessionState.PREVIEW -> getString(R.string.start_navigation_nav_preview)
                NavSessionState.BROWSE -> {
                    if (selectedDestinationPoint == null) {
                        getString(R.string.preview_navigation_route)
                    } else {
                        getString(R.string.preview_navigation_route)
                    }
                }
            }
        }
        if (uiMode == UiMode.PRACTICE) {
            binding.startNavigation.isEnabled = !isPracticeRouteLoading && practiceRunStage == PracticeRunStage.IDLE
        }
        binding.stopNavigationButton.isVisible =
            uiMode == UiMode.NAVIGATION && navSessionState == NavSessionState.ACTIVE
    }

    private fun observeUiState() {
        lifecycleScope.launch {
            repeatOnLifecycle(Lifecycle.State.STARTED) {
                mainViewModel.uiState.collectLatest {
                    applyUiModeState()
                }
            }
        }
    }

    private fun observeSettings() {
        lifecycleScope.launch {
            repeatOnLifecycle(Lifecycle.State.STARTED) {
                combine(
                    settingsRepository.voiceMode,
                    settingsRepository.preferredUnits
                ) { voiceMode, units ->
                    voiceMode to units
                }.collectLatest { (voiceModeSetting, unitsSetting) ->
                    preferredUnitsSetting = unitsSetting
                    if (::sessionManager.isInitialized) {
                        sessionManager.setPreferredUnits(unitsSetting)
                        sessionManager.setVoiceMode(voiceModeSetting)
                    }
                    val mappedVoiceMode = when (voiceModeSetting) {
                        VoiceModeSetting.ALL -> VoiceGuidanceMode.FULL
                        VoiceModeSetting.ALERTS -> VoiceGuidanceMode.ALERTS_ONLY
                        VoiceModeSetting.MUTE -> VoiceGuidanceMode.MUTE
                    }
                    val previousMode = voiceGuidanceMode
                    voiceGuidanceMode = mappedVoiceMode
                    if (voiceGuidanceMode == VoiceGuidanceMode.MUTE && previousMode != VoiceGuidanceMode.MUTE) {
                        speechApi.cancel()
                        voiceInstructionsPlayer.clear()
                    }
                    renderVoiceGuidanceMode()
                }
            }
        }
    }

    private fun toNavSessionState(state: NavigationSessionManager.SessionState): NavSessionState {
        return when (state) {
            NavigationSessionManager.SessionState.BROWSE -> NavSessionState.BROWSE
            NavigationSessionManager.SessionState.PREVIEW -> NavSessionState.PREVIEW
            NavigationSessionManager.SessionState.ACTIVE -> NavSessionState.ACTIVE
        }
    }

    private fun selectedCentreLabel(): String {
        val centreName = selectedCentre?.name ?: defaultTestCentreLabel
        return centreName.removeSuffix(" Driving Test Centre").trim()
    }

    private fun selectedCentrePoint(): Point? {
        val centre = selectedCentre ?: return null
        return Point.fromLngLat(centre.lon, centre.lat)
    }

    private fun initialCameraCenter(): Point {
        return selectedCentrePoint() ?: fallbackTestCentrePoint
    }

    private fun renderDestinationMarker() {
        if (!styleLoaded) return
        val destination = selectedDestinationPoint ?: return
        val manager = destinationAnnotationManager ?: return

        destinationAnnotation?.let { manager.delete(it) }
        destinationAnnotation = manager.create(
            PointAnnotationOptions()
                .withPoint(destination)
                .withIconImage("marker-15")
                .withIconSize(1.8)
        )
    }

    private fun handleNavigationPrimaryAction() {
        when (navSessionState) {
            NavSessionState.BROWSE -> {
                val destination = selectedDestinationPoint
                if (destination == null) {
                    Toast.makeText(this, getString(R.string.destination_required), Toast.LENGTH_SHORT).show()
                } else {
                    ensureSessionManager()
                    sessionManager.previewDestination(destination)
                }
            }
            NavSessionState.PREVIEW -> beginGuidance()
            NavSessionState.ACTIVE -> {
                // Active session is controlled by Stop.
            }
        }
    }

    private fun previewNavigationToDestination() {
        val destination = selectedDestinationPoint
        if (destination == null) {
            Toast.makeText(this, getString(R.string.destination_required), Toast.LENGTH_SHORT).show()
            return
        }

        binding.startNavigation.isEnabled = false
        lifecycleScope.launch {
            val origin = latestEnhancedLocationPoint ?: selectedCentrePoint() ?: fallbackTestCentrePoint
            val previewRoute = requestRouteForCoordinates(
                coordinates = listOf(origin, destination),
                alternatives = true
            )
            if (previewRoute != null) {
                navSessionState = NavSessionState.PREVIEW
                mainViewModel.setSessionState(NavigationSessionManager.SessionState.PREVIEW)
                mapboxNavigation.setNavigationRoutes(listOf(previewRoute))
                updatePreviewSummaryFromRoutes(listOf(previewRoute))
                binding.maneuverView.isVisible = false
                binding.routeProgressBanner.isVisible = false
                Toast.makeText(
                    this@MainActivity,
                    getString(R.string.nav_preview_loaded),
                    Toast.LENGTH_SHORT
                ).show()
            } else {
                navSessionState = NavSessionState.BROWSE
                mainViewModel.setSessionState(NavigationSessionManager.SessionState.BROWSE)
                clearPreviewSummary()
                binding.maneuverView.isVisible = false
                binding.routeProgressBanner.isVisible = false
                Toast.makeText(
                    this@MainActivity,
                    getString(R.string.nav_preview_failed),
                    Toast.LENGTH_LONG
                ).show()
            }
            applyUiModeState()
            binding.startNavigation.isEnabled = true
        }
    }

    private fun beginGuidance() {
        if (uiMode != UiMode.NAVIGATION || navSessionState != NavSessionState.PREVIEW) {
            return
        }
        ensureSessionManager()
        if (replayEnabled) {
            syncReplayToPrimaryRoute()
        }
        sessionManager.start()
        navSessionState = NavSessionState.ACTIVE
        binding.maneuverView.isVisible = true
        binding.routeProgressBanner.isVisible = true
        binding.navPreviewSummaryBanner.isVisible = false
        applyUiModeState()
    }

    private fun stopNavigationSession() {
        if (uiMode != UiMode.NAVIGATION) return
        ensureSessionManager()
        sessionManager.stop()
        navSessionState = NavSessionState.BROWSE
        binding.maneuverView.isVisible = false
        binding.routeProgressBanner.isVisible = false
        clearPreviewSummary()
        applyUiModeState()
    }

    private fun updatePreviewSummaryFromRoutes(routes: List<NavigationRoute>) {
        if (routes.isEmpty()) {
            clearPreviewSummary()
            return
        }
        val primary = routes.first()
        val directionsRoute = primary.directionsRoute
        val distanceMeters = directionsRoute.distance() ?: 0.0
        val durationSeconds = directionsRoute.duration() ?: 0.0
        val etaTime = Date(System.currentTimeMillis() + (durationSeconds * 1000).toLong())
        val etaLabel = SimpleDateFormat("h:mm a", Locale.UK).format(etaTime).lowercase(Locale.UK)

        binding.navPreviewSummaryBanner.isVisible = true
        binding.navPreviewDistanceValue.text = getString(
            R.string.preview_summary_distance,
            formatMiles(distanceMeters)
        )
        binding.navPreviewEtaValue.text = getString(R.string.preview_summary_eta, etaLabel)
        binding.navPreviewDestinationValue.text = selectedDestinationName
            ?: getString(R.string.destination_marker_fallback)
    }

    private fun clearPreviewSummary() {
        binding.navPreviewSummaryBanner.isVisible = false
        binding.navPreviewDistanceValue.text = "-"
        binding.navPreviewEtaValue.text = "-"
        binding.navPreviewDestinationValue.text = "-"
    }

    private fun formatMiles(distanceMeters: Double): String {
        return if (preferredUnitsSetting == PreferredUnitsSetting.METRIC_KMH) {
            val km = distanceMeters / 1000.0
            String.format(Locale.UK, "%.1f km", km)
        } else {
            val miles = distanceMeters / 1609.344
            String.format(Locale.UK, "%.1f mi", miles)
        }
    }

    private fun resetCameraBearingToNorth() {
        val cameraState = binding.mapView.mapboxMap.cameraState
        val mapAnimationOptions = MapAnimationOptions.Builder().duration(700L).build()
        binding.mapView.camera.easeTo(
            CameraOptions.Builder()
                .center(cameraState.center)
                .zoom(cameraState.zoom)
                .pitch(cameraState.pitch)
                .bearing(0.0)
                .padding(cameraState.padding)
                .build(),
            mapAnimationOptions
        )
    }

    private fun showRouteOverview() {
        val route = routeLineApi.getPrimaryNavigationRoute()
            ?: mapboxNavigation.getNavigationRoutes().firstOrNull()
        val geometry = route?.directionsRoute?.geometry()

        if (geometry.isNullOrBlank()) {
            Toast.makeText(this, getString(R.string.no_route_for_overview), Toast.LENGTH_SHORT).show()
            return
        }

        val routePoints = runCatching { LineString.fromPolyline(geometry, 6).coordinates() }
            .recoverCatching { LineString.fromPolyline(geometry, 5).coordinates() }
            .getOrNull()

        if (routePoints.isNullOrEmpty()) {
            Toast.makeText(this, getString(R.string.no_route_for_overview), Toast.LENGTH_SHORT).show()
            return
        }

        val overviewCamera = binding.mapView.mapboxMap.cameraForCoordinates(
            routePoints,
            EdgeInsets(180.0, 80.0, 320.0, 80.0),
            null,
            null
        )
        binding.mapView.camera.easeTo(
            overviewCamera,
            MapAnimationOptions.Builder().duration(900L).build()
        )
    }

    private fun renderSpeedometer(speedInfo: SpeedInfoValue?) {
        if (speedInfo == null) {
            binding.speedometerCard.isVisible = false
            return
        }

        val unitForConversion = speedInfo.postedSpeedUnit
        val displayedCurrentSpeed = convertSpeedForPreferredUnits(speedInfo.currentSpeed, unitForConversion)
        val displayedPostedSpeed = speedInfo.postedSpeed?.let { posted ->
            convertSpeedForPreferredUnits(posted, unitForConversion)
        }
        val isOverLimit =
            displayedPostedSpeed != null && displayedPostedSpeed > 0 && displayedCurrentSpeed > displayedPostedSpeed
        val limitTextColorRes =
            if (isOverLimit) R.color.speedometer_limit_text_alert else R.color.speedometer_limit_text_default
        val limitBackgroundRes =
            if (isOverLimit) R.drawable.bg_speed_limit_sign_alert else R.drawable.bg_speed_limit_sign
        val speedometerBackgroundRes =
            if (isOverLimit) R.drawable.bg_speedometer_waze_alert else R.drawable.bg_speedometer_waze

        binding.speedometerCard.isVisible = true
        binding.currentSpeedValue.text = displayedCurrentSpeed.toString()
        binding.currentSpeedUnit.text = speedUnitLabel(speedInfo.postedSpeedUnit)
        binding.speedometerDialBackground.setBackgroundResource(speedometerBackgroundRes)

        if (displayedPostedSpeed != null && displayedPostedSpeed > 0) {
            binding.speedLimitValue.isVisible = true
            binding.speedLimitValue.text = displayedPostedSpeed.toString()
            binding.speedLimitValue.setTextColor(ContextCompat.getColor(this, limitTextColorRes))
            binding.speedLimitValue.setBackgroundResource(limitBackgroundRes)
        } else {
            binding.speedLimitValue.isVisible = false
        }
    }

    private fun speedUnitLabel(speedUnit: SpeedUnit): String {
        if (preferredUnitsSetting == PreferredUnitsSetting.METRIC_KMH) {
            return "KM/H"
        }
        if (preferredUnitsSetting == PreferredUnitsSetting.UK_MPH) {
            return "MPH"
        }
        return when (speedUnit) {
            SpeedUnit.MILES_PER_HOUR -> "MPH"
            SpeedUnit.KILOMETERS_PER_HOUR -> "KM/H"
            SpeedUnit.METERS_PER_SECOND -> "M/S"
        }
    }

    private fun convertSpeedForPreferredUnits(value: Int, rawUnit: SpeedUnit): Int {
        val speedInMps = when (rawUnit) {
            SpeedUnit.MILES_PER_HOUR -> value * 0.44704
            SpeedUnit.KILOMETERS_PER_HOUR -> value / 3.6
            SpeedUnit.METERS_PER_SECOND -> value.toDouble()
        }
        return when (preferredUnitsSetting) {
            PreferredUnitsSetting.UK_MPH -> (speedInMps / 0.44704).roundToInt()
            PreferredUnitsSetting.METRIC_KMH -> (speedInMps * 3.6).roundToInt()
        }
    }

    private fun cycleVoiceGuidanceMode() {
        val next = when (voiceGuidanceMode) {
            VoiceGuidanceMode.FULL -> VoiceModeSetting.ALERTS
            VoiceGuidanceMode.ALERTS_ONLY -> VoiceModeSetting.MUTE
            VoiceGuidanceMode.MUTE -> VoiceModeSetting.ALL
        }
        val nextLabel = when (next) {
            VoiceModeSetting.ALL -> getString(R.string.voice_mode_all)
            VoiceModeSetting.ALERTS -> getString(R.string.voice_mode_alerts)
            VoiceModeSetting.MUTE -> getString(R.string.voice_mode_mute)
        }

        lifecycleScope.launch {
            settingsRepository.setVoiceMode(next)
        }
        Toast.makeText(this, nextLabel, Toast.LENGTH_SHORT).show()
    }

    private fun renderVoiceGuidanceMode() {
        when (voiceGuidanceMode) {
            VoiceGuidanceMode.FULL -> {
                binding.voiceModeButton.setImageResource(R.drawable.ic_voice_all_waze)
                binding.voiceModeButton.imageTintList =
                    ContextCompat.getColorStateList(this, R.color.map_control_voice_icon_all)
            }
            VoiceGuidanceMode.ALERTS_ONLY -> {
                binding.voiceModeButton.setImageResource(R.drawable.ic_voice_alerts_waze)
                binding.voiceModeButton.imageTintList =
                    ContextCompat.getColorStateList(this, R.color.voice_chip_icon_alert)
            }
            VoiceGuidanceMode.MUTE -> {
                binding.voiceModeButton.setImageResource(R.drawable.ic_voice_mute_waze)
                binding.voiceModeButton.imageTintList =
                    ContextCompat.getColorStateList(this, R.color.voice_chip_icon_mute)
            }
        }
        binding.voiceModeButton.contentDescription = currentVoiceModeLabel()
    }

    private fun currentVoiceModeLabel(): String {
        return when (voiceGuidanceMode) {
            VoiceGuidanceMode.FULL -> getString(R.string.voice_mode_all)
            VoiceGuidanceMode.ALERTS_ONLY -> getString(R.string.voice_mode_alerts)
            VoiceGuidanceMode.MUTE -> getString(R.string.voice_mode_mute)
        }
    }

    private fun shouldSpeakVoiceInstruction(voiceInstructions: VoiceInstructions): Boolean {
        return when (voiceGuidanceMode) {
            VoiceGuidanceMode.FULL -> true
            VoiceGuidanceMode.MUTE -> false
            VoiceGuidanceMode.ALERTS_ONLY -> {
                val distanceToManeuver = voiceInstructions.distanceAlongGeometry() ?: Double.MAX_VALUE
                val announcement = voiceInstructions.announcement().orEmpty().lowercase(Locale.getDefault())
                distanceToManeuver <= alertsOnlyDistanceMeters || isCriticalVoiceAnnouncement(announcement)
            }
        }
    }

    private fun isCriticalVoiceAnnouncement(announcement: String): Boolean {
        if (announcement.isBlank()) {
            return false
        }
        val criticalKeywords = listOf(
            "arrive",
            "destination",
            "roundabout",
            "exit",
            "u-turn",
            "merge",
            "keep",
            "ferry"
        )
        return criticalKeywords.any { keyword -> announcement.contains(keyword) }
    }

    private fun isDuplicateVoiceInstruction(voiceInstructions: VoiceInstructions): Boolean {
        val announcement = voiceInstructions.announcement()?.trim().orEmpty()
        if (announcement.isBlank()) {
            return false
        }

        val nowMs = System.currentTimeMillis()
        val isDuplicate = announcement == lastSpokenAnnouncement &&
            nowMs - lastSpokenAtMs < duplicateVoiceWindowMs
        if (!isDuplicate) {
            lastSpokenAnnouncement = announcement
            lastSpokenAtMs = nowMs
        }
        return isDuplicate
    }

    override fun onDestroy() {
        if (::sessionManager.isInitialized) {
            sessionManager.onDestroy()
        }
        destinationAnnotationManager?.deleteAll()
        destinationAnnotationManager = null
        super.onDestroy()
        speechApi.cancel()
        voiceInstructionsPlayer.shutdown()
        routeLineApi.cancel()
        routeLineView.cancel()
        maneuverApi.cancel()
    }

    private fun hasLocationPermission(): Boolean {
        return ContextCompat.checkSelfPermission(
            this,
            Manifest.permission.ACCESS_FINE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED ||
            ContextCompat.checkSelfPermission(
                this,
                Manifest.permission.ACCESS_COARSE_LOCATION
            ) == PackageManager.PERMISSION_GRANTED
    }

    private fun requestLocationPermission() {
        locationPermissionLauncher.launch(
            arrayOf(
                Manifest.permission.ACCESS_FINE_LOCATION,
                Manifest.permission.ACCESS_COARSE_LOCATION
            )
        )
    }

    private fun initNavigation() {
        MapboxNavigationApp.setup(
            NavigationOptions.Builder(this)
                .routeAlternativesOptions(
                    RouteAlternativesOptions.Builder()
                        .intervalMillis(TimeUnit.MINUTES.toMillis(3))
                        .build()
                )
                .build()
        )

        binding.mapView.location.apply {
            locationPuck = LocationPuck2D(
                bearingImage = ImageHolder.from(
                    com.mapbox.navigation.ui.components.R.drawable.mapbox_navigation_puck_icon
                )
            )
            setLocationProvider(navigationLocationProvider)
            puckBearingEnabled = true
            enabled = true
        }

        updateTopOrnamentsPosition()
        if (replayEnabled) {
            replayOriginLocation()
        }
    }

    private fun generatePracticeRoutes() {
        isPracticeRouteLoading = true
        applyUiModeState()

        lifecycleScope.launch {
            try {
                val configuredRoutes = runCatching {
                    practiceRouteStore.loadRoutesForCentre(selectedCentreId)
                }.getOrDefault(emptyList())

                if (configuredRoutes.isEmpty()) {
                    resetPracticeRunState()
                    binding.maneuverView.isVisible = false
                    binding.routeProgressBanner.isVisible = false
                    applyUiModeState()
                    updateTopOrnamentsPosition()
                    Toast.makeText(
                        this@MainActivity,
                        "No practice routes found for ${selectedCentreLabel()}.",
                        Toast.LENGTH_LONG
                    ).show()
                    return@launch
                }

                val selectedRoute = orderRoutesBySelection(configuredRoutes).firstOrNull()
                if (selectedRoute == null) {
                    resetPracticeRunState()
                    binding.maneuverView.isVisible = false
                    binding.routeProgressBanner.isVisible = false
                    applyUiModeState()
                    updateTopOrnamentsPosition()
                    Toast.makeText(
                        this@MainActivity,
                        "Could not load selected practice route.",
                        Toast.LENGTH_LONG
                    ).show()
                    return@launch
                }

                val practiceNavigationRoute = requestRouteForPracticeRoute(selectedRoute)
                if (practiceNavigationRoute == null) {
                    resetPracticeRunState()
                    binding.maneuverView.isVisible = false
                    binding.routeProgressBanner.isVisible = false
                    applyUiModeState()
                    updateTopOrnamentsPosition()
                    Toast.makeText(
                        this@MainActivity,
                        "Could not generate ${selectedCentreLabel()} routes. Check token/network.",
                        Toast.LENGTH_LONG
                    ).show()
                    return@launch
                }

                val startPoint = Point.fromLngLat(selectedRoute.startLon, selectedRoute.startLat)
                val originPoint = awaitCurrentEnhancedLocationPoint()
                if (originPoint == null) {
                    resetPracticeRunState()
                    Toast.makeText(
                        this@MainActivity,
                        getString(R.string.practice_waiting_for_gps),
                        Toast.LENGTH_LONG
                    ).show()
                    return@launch
                }

                selectedPracticeNavigationRoute = practiceNavigationRoute
                practiceStartPoint = startPoint

                ensureSessionManager()
                sessionManager.stop()
                sessionManager.previewPracticeRoute(selectedRoute)

                val distanceToStartMeters = distanceMeters(originPoint, startPoint)
                val shouldApproachStart = distanceToStartMeters > practiceStartMatchRadiusMeters

                if (shouldApproachStart) {
                    val approachRoute = requestRouteForCoordinates(
                        coordinates = listOf(originPoint, startPoint),
                        alternatives = false
                    )
                    if (approachRoute == null) {
                        resetPracticeRunState()
                        binding.maneuverView.isVisible = false
                        binding.routeProgressBanner.isVisible = false
                        applyUiModeState()
                        Toast.makeText(
                            this@MainActivity,
                            getString(R.string.practice_start_approach_failed),
                            Toast.LENGTH_LONG
                        ).show()
                        return@launch
                    }
                    mapboxNavigation.setNavigationRoutes(listOf(approachRoute))
                    if (replayEnabled) {
                        syncReplayToRoute(approachRoute)
                    }
                    practiceRunStage = PracticeRunStage.APPROACHING_START
                    sessionManager.start()
                    binding.maneuverView.isVisible = true
                    binding.routeProgressBanner.isVisible = true
                    updateTopOrnamentsPosition()
                    Toast.makeText(
                        this@MainActivity,
                        getString(R.string.practice_driving_to_start),
                        Toast.LENGTH_LONG
                    ).show()
                } else {
                    sessionManager.start()
                    startSelectedPracticeRoute()
                }
            } finally {
                isPracticeRouteLoading = false
                applyUiModeState()
            }
        }
    }

    private suspend fun awaitCurrentEnhancedLocationPoint(
        timeoutMs: Long = 12_000L,
        pollIntervalMs: Long = 300L
    ): Point? {
        val retries = (timeoutMs / pollIntervalMs).toInt().coerceAtLeast(1)
        repeat(retries) {
            latestEnhancedLocationPoint?.let { return it }
            delay(pollIntervalMs)
        }
        return latestEnhancedLocationPoint
    }

    private fun handlePracticeRunProgress(
        distanceRemainingMeters: Double,
        completionPercent: Int
    ) {
        if (uiMode != UiMode.PRACTICE) return
        when (practiceRunStage) {
            PracticeRunStage.IDLE -> Unit
            PracticeRunStage.APPROACHING_START -> {
                val startPoint = practiceStartPoint ?: return
                val currentPoint = latestEnhancedLocationPoint
                val atStartByLocation = currentPoint != null &&
                    distanceMeters(currentPoint, startPoint) <= practiceStartMatchRadiusMeters
                val atStartByRoute =
                    completionPercent >= practiceRouteFinishPercent ||
                        distanceRemainingMeters <= practiceApproachArrivalMeters
                if (atStartByLocation || atStartByRoute) {
                    startSelectedPracticeRoute()
                }
            }
            PracticeRunStage.ROUTE_ACTIVE -> {
                val finishedByProgress = completionPercent >= practiceRouteFinishPercent
                val finishedByDistance = distanceRemainingMeters <= practiceRouteFinishMeters
                if (finishedByProgress || finishedByDistance) {
                    completePracticeRun()
                }
            }
        }
    }

    private fun startSelectedPracticeRoute() {
        val selectedRoute = selectedPracticeNavigationRoute ?: return
        practiceRunStage = PracticeRunStage.ROUTE_ACTIVE
        mapboxNavigation.setNavigationRoutes(listOf(selectedRoute))
        if (replayEnabled) {
            syncReplayToRoute(selectedRoute)
        }
        binding.maneuverView.isVisible = true
        binding.routeProgressBanner.isVisible = true
        updateTopOrnamentsPosition()
        applyUiModeState()
        Toast.makeText(
            this,
            getString(R.string.practice_start_selected_route),
            Toast.LENGTH_SHORT
        ).show()
    }

    private fun completePracticeRun() {
        if (practiceRunStage != PracticeRunStage.ROUTE_ACTIVE) return
        resetPracticeRunState()
        if (::sessionManager.isInitialized) {
            sessionManager.stop()
        }
        binding.maneuverView.isVisible = false
        binding.routeProgressBanner.isVisible = false
        applyUiModeState()
        Toast.makeText(
            this,
            getString(R.string.practice_route_complete),
            Toast.LENGTH_LONG
        ).show()
    }

    private fun resetPracticeRunState() {
        practiceRunStage = PracticeRunStage.IDLE
        selectedPracticeNavigationRoute = null
        practiceStartPoint = null
    }

    private fun orderRoutesBySelection(routes: List<PracticeRoute>): List<PracticeRoute> {
        val preferredRouteId = selectedRouteId ?: return routes
        val preferredRoute = routes.firstOrNull { it.id == preferredRouteId } ?: return routes
        return buildList {
            add(preferredRoute)
            addAll(routes.filterNot { it.id == preferredRouteId })
        }
    }

    private suspend fun requestRouteForPracticeRoute(route: PracticeRoute): NavigationRoute? {
        val rawPoints = route.geometry.map { point ->
            Point.fromLngLat(point.lon, point.lat)
        }
        val points = normalizePracticeRouteCoordinates(rawPoints)
        return requestRouteForCoordinates(
            coordinates = points,
            alternatives = false,
            waypointIndices = buildWaypointIndices(points.size)
        )
    }

    private suspend fun requestRouteForCoordinates(
        coordinates: List<Point>,
        alternatives: Boolean = false,
        waypointIndices: List<Int>? = null
    ): NavigationRoute? {
        val routeOptionsBuilder = RouteOptions.builder()
            .applyDefaultNavigationOptions()
            .applyLanguageAndVoiceUnitOptions(this)
            .coordinatesList(coordinates)
            .layersList(buildLayersList(coordinates.size))
            .alternatives(alternatives)
        if (!waypointIndices.isNullOrEmpty()) {
            routeOptionsBuilder.waypointIndicesList(waypointIndices)
        }
        val routeOptions = routeOptionsBuilder.build()

        return suspendCancellableCoroutine { continuation ->
            mapboxNavigation.requestRoutes(
                routeOptions,
                object : NavigationRouterCallback {
                    override fun onRoutesReady(
                        routes: List<NavigationRoute>,
                        @RouterOrigin routerOrigin: String
                    ) {
                        val firstRoute = routes.firstOrNull()?.directionsRoute
                        Log.d(
                            TAG,
                            "Routes ready: count=${routes.size} distanceM=${firstRoute?.distance()} durationS=${firstRoute?.duration()}"
                        )
                        if (continuation.isActive) {
                            continuation.resume(routes.firstOrNull())
                        }
                    }

                    override fun onFailure(reasons: List<RouterFailure>, routeOptions: RouteOptions) {
                        if (continuation.isActive) {
                            continuation.resume(null)
                        }
                    }

                    override fun onCanceled(
                        routeOptions: RouteOptions,
                        @RouterOrigin routerOrigin: String
                    ) {
                        if (continuation.isActive) {
                            continuation.resume(null)
                        }
                    }
                }
            )
        }
    }

    private fun buildLayersList(pointCount: Int): List<Int?> {
        val list = MutableList<Int?>(pointCount) { null }
        list[0] = mapboxNavigation.getZLevel()
        return list
    }

    private fun buildWaypointIndices(pointCount: Int): List<Int>? {
        if (pointCount < 2) return null
        return listOf(0, pointCount - 1)
    }

    private fun normalizePracticeRouteCoordinates(points: List<Point>): List<Point> {
        if (points.size < 3) return points
        val firstPoint = points.first()
        val lastPoint = points.last()
        val closesLoopAtSameCoordinate = distanceMeters(firstPoint, lastPoint) <= 12.0
        if (!closesLoopAtSameCoordinate) {
            return points
        }

        val secondPoint = points[1]
        val nudgedStart = Point.fromLngLat(
            firstPoint.longitude() + (secondPoint.longitude() - firstPoint.longitude()) * 0.03,
            firstPoint.latitude() + (secondPoint.latitude() - firstPoint.latitude()) * 0.03
        )

        return buildList {
            add(nudgedStart)
            addAll(points.drop(1))
        }
    }

    private fun distanceMeters(a: Point, b: Point): Double {
        val earthRadiusMeters = 6_371_000.0
        val lat1 = Math.toRadians(a.latitude())
        val lat2 = Math.toRadians(b.latitude())
        val dLat = lat2 - lat1
        val dLon = Math.toRadians(b.longitude() - a.longitude())
        val haversine = sin(dLat / 2) * sin(dLat / 2) +
            cos(lat1) * cos(lat2) * sin(dLon / 2) * sin(dLon / 2)
        val c = 2 * asin(sqrt(haversine.coerceIn(0.0, 1.0)))
        return earthRadiusMeters * c
    }

    private fun normalizedCompletionPercent(rawPercent: Double): Int {
        if (!rawPercent.isFinite()) return 0
        val normalized = if (rawPercent <= 1.0) rawPercent * 100.0 else rawPercent
        return normalized.roundToInt().coerceIn(0, 100)
    }

    private fun updateCamera(
        point: Point,
        bearing: Double? = null,
        speedMetersPerSecond: Double = latestSpeedMetersPerSecond
    ) {
        val targetZoom = dynamicZoomLevel(speedMetersPerSecond, latestDistanceToManeuverMeters)
        val targetPitch = dynamicPitchLevel(speedMetersPerSecond)

        // Smooth zoom/pitch transitions to avoid jitter when speed changes rapidly.
        val zoomToApply = smoothCameraValue(lastCameraZoom, targetZoom, 0.3)
        val pitchToApply = smoothCameraValue(lastCameraPitch, targetPitch, 0.22)
        lastCameraZoom = zoomToApply
        lastCameraPitch = pitchToApply

        val animationDurationMs = if (navSessionState == NavSessionState.ACTIVE || uiMode == UiMode.PRACTICE) {
            700L
        } else {
            1200L
        }
        val cameraPadding = dynamicCameraPadding(speedMetersPerSecond, latestDistanceToManeuverMeters)

        val mapAnimationOptions = MapAnimationOptions.Builder().duration(animationDurationMs).build()
        binding.mapView.camera.easeTo(
            CameraOptions.Builder()
                .center(point)
                .bearing(bearing)
                .zoom(zoomToApply)
                .pitch(pitchToApply)
                .padding(cameraPadding)
                .build(),
            mapAnimationOptions
        )
    }

    private fun dynamicZoomLevel(
        speedMetersPerSecond: Double,
        distanceToManeuverMeters: Double
    ): Double {
        val speedKmh = max(0.0, speedMetersPerSecond * 3.6)
        val baseZoom = when {
            speedKmh < 10.0 -> 18.5
            speedKmh < 20.0 -> 18.1
            speedKmh < 32.0 -> 17.7
            speedKmh < 45.0 -> 17.3
            speedKmh < 60.0 -> 16.9
            speedKmh < 80.0 -> 16.5
            else -> 16.1
        }
        val maneuverBoost = when {
            distanceToManeuverMeters <= 35.0 -> 1.25
            distanceToManeuverMeters <= 70.0 -> 1.0
            distanceToManeuverMeters <= 120.0 -> 0.75
            distanceToManeuverMeters <= 200.0 -> 0.45
            distanceToManeuverMeters <= 320.0 -> 0.25
            else -> 0.0
        }
        return (baseZoom + maneuverBoost).coerceIn(15.8, 19.0)
    }

    private fun dynamicPitchLevel(speedMetersPerSecond: Double): Double {
        val speedKmh = max(0.0, speedMetersPerSecond * 3.6)
        return when {
            speedKmh < 16.0 -> 34.0
            speedKmh < 32.0 -> 38.0
            speedKmh < 55.0 -> 42.0
            speedKmh < 80.0 -> 46.0
            else -> 48.0
        }
    }

    private fun dynamicCameraPadding(
        speedMetersPerSecond: Double,
        distanceToManeuverMeters: Double
    ): EdgeInsets {
        val speedKmh = max(0.0, speedMetersPerSecond * 3.6)
        val baseTopPadding = when {
            speedKmh < 20.0 -> 640.0
            speedKmh < 45.0 -> 700.0
            speedKmh < 70.0 -> 760.0
            else -> 820.0
        }
        val maneuverTighten = when {
            distanceToManeuverMeters <= 60.0 -> 150.0
            distanceToManeuverMeters <= 140.0 -> 100.0
            distanceToManeuverMeters <= 250.0 -> 60.0
            else -> 0.0
        }
        val topPadding = (baseTopPadding - maneuverTighten).coerceIn(520.0, 860.0)
        return EdgeInsets(topPadding, 20.0, 250.0, 20.0)
    }

    private fun smoothCameraValue(previous: Double, target: Double, factor: Double): Double {
        val clampedFactor = factor.coerceIn(0.05, 0.9)
        if (abs(target - previous) < 0.02) {
            return target
        }
        return previous + ((target - previous) * clampedFactor)
    }

    private fun replayOriginLocation() {
        if (!replayEnabled) return
        val originPoint = initialCameraCenter()
        with(mapboxNavigation.mapboxReplayer) {
            stop()
            clearEvents()
            pushEvents(
                listOf(
                    ReplayRouteMapper.mapToUpdateLocation(Date().time.toDouble(), originPoint)
                )
            )
            playFirstLocation()
            playbackSpeed(1.0)
            play()
        }
        mapboxNavigation.startReplayTripSession()
        Log.d(TAG, "Replay anchored to origin only.")
    }

    private fun syncReplayToPrimaryRoute() {
        if (!replayEnabled) return
        val primaryRoute = mapboxNavigation.getNavigationRoutes().firstOrNull()
        if (primaryRoute == null) {
            replayOriginLocation()
            return
        }
        syncReplayToRoute(primaryRoute)
    }

    private fun syncReplayToRoute(route: NavigationRoute) {
        if (!replayEnabled) return
        val replayEvents = replayRouteMapper.mapDirectionsRouteGeometry(route.directionsRoute)
        if (replayEvents.isEmpty()) {
            replayOriginLocation()
            return
        }

        with(mapboxNavigation.mapboxReplayer) {
            stop()
            clearEvents()
            pushEvents(replayEvents)
            playFirstLocation()
            playbackSpeed(1.0)
            play()
        }
        mapboxNavigation.startReplayTripSession()
        Log.d(TAG, "Replay synced to route geometry. events=${replayEvents.size}")
    }

    private fun isLikelyEmulator(): Boolean {
        val fingerprint = Build.FINGERPRINT.lowercase(Locale.US)
        val model = Build.MODEL.lowercase(Locale.US)
        val product = Build.PRODUCT.lowercase(Locale.US)
        val manufacturer = Build.MANUFACTURER.lowercase(Locale.US)
        val brand = Build.BRAND.lowercase(Locale.US)
        val device = Build.DEVICE.lowercase(Locale.US)
        val hardware = Build.HARDWARE.lowercase(Locale.US)

        return fingerprint.startsWith("generic") ||
            fingerprint.contains("emulator") ||
            model.contains("emulator") ||
            model.contains("android sdk built for") ||
            product.contains("sdk") ||
            product.contains("emulator") ||
            hardware.contains("goldfish") ||
            hardware.contains("ranchu") ||
            manufacturer.contains("genymotion") ||
            (brand.startsWith("generic") && device.startsWith("generic"))
    }

    private companion object {
        private const val TAG = "MainActivity"
    }
}
