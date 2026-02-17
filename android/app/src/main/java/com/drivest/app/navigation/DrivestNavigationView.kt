package com.drivest.app.navigation

import android.annotation.SuppressLint
import android.content.res.ColorStateList
import android.graphics.Color
import android.graphics.Rect
import android.graphics.drawable.GradientDrawable
import android.os.Looper
import android.os.SystemClock
import android.util.Log
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.ImageButton
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import com.drivest.app.BuildConfig
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactContext
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.WritableMap
import com.facebook.react.uimanager.events.RCTEventEmitter
import com.mapbox.api.directions.v5.models.RouteOptions
import com.mapbox.api.directions.v5.models.VoiceInstructions
import com.mapbox.bindgen.Expected
import com.mapbox.bindgen.Value
import com.mapbox.common.location.Location
import com.mapbox.maps.EdgeInsets
import com.mapbox.maps.ImageHolder
import com.mapbox.geojson.Feature
import com.mapbox.geojson.FeatureCollection
import com.mapbox.geojson.LineString
import com.mapbox.geojson.Point
import com.mapbox.maps.CameraOptions
import com.mapbox.maps.MapInitOptions
import com.mapbox.maps.MapView
import com.mapbox.maps.Style
import com.mapbox.maps.extension.style.layers.generated.CircleLayer
import com.mapbox.maps.extension.style.layers.generated.LineLayer
import com.mapbox.maps.extension.style.layers.properties.generated.LineCap
import com.mapbox.maps.extension.style.layers.properties.generated.LineJoin
import com.mapbox.maps.extension.style.sources.generated.GeoJsonSource
import com.mapbox.maps.plugin.animation.camera
import com.mapbox.maps.plugin.LocationPuck2D
import com.mapbox.maps.plugin.PuckBearing
import com.mapbox.maps.plugin.locationcomponent.location
import com.mapbox.navigation.base.ExperimentalPreviewMapboxNavigationAPI
import com.mapbox.navigation.base.formatter.DistanceFormatterOptions
import com.mapbox.navigation.base.formatter.UnitType
import com.mapbox.navigation.base.extensions.applyDefaultNavigationOptions
import com.mapbox.navigation.base.extensions.applyLanguageAndVoiceUnitOptions
import com.mapbox.navigation.base.options.NavigationOptions
import com.mapbox.navigation.base.route.NavigationRoute
import com.mapbox.navigation.base.route.NavigationRouterCallback
import com.mapbox.navigation.base.route.RouterFailure
import com.mapbox.navigation.base.trip.model.RouteProgress
import com.mapbox.navigation.core.MapboxNavigation
import com.mapbox.navigation.core.MapboxNavigationProvider
import com.mapbox.navigation.core.formatter.MapboxDistanceFormatter
import com.mapbox.navigation.core.directions.session.RoutesObserver
import com.mapbox.navigation.core.trip.session.LocationMatcherResult
import com.mapbox.navigation.core.trip.session.LocationObserver
import com.mapbox.navigation.core.trip.session.RouteProgressObserver
import com.mapbox.navigation.core.trip.session.VoiceInstructionsObserver
import com.mapbox.navigation.tripdata.maneuver.api.MapboxManeuverApi
import com.mapbox.navigation.tripdata.maneuver.model.Maneuver
import com.mapbox.navigation.tripdata.maneuver.model.ManeuverError
import com.mapbox.navigation.tripdata.maneuver.model.ManeuverOptions
import com.mapbox.navigation.tripdata.progress.api.MapboxTripProgressApi
import com.mapbox.navigation.tripdata.progress.model.DistanceRemainingFormatter
import com.mapbox.navigation.tripdata.progress.model.EstimatedTimeToArrivalFormatter
import com.mapbox.navigation.tripdata.progress.model.TimeRemainingFormatter
import com.mapbox.navigation.tripdata.progress.model.TripProgressUpdateFormatter
import com.mapbox.navigation.ui.components.maneuver.view.MapboxManeuverView
import com.mapbox.navigation.ui.components.tripprogress.view.MapboxTripProgressView
import com.mapbox.navigation.ui.components.voice.view.MapboxAudioGuidanceButton
import com.mapbox.navigation.ui.maps.camera.NavigationCamera
import com.mapbox.navigation.ui.maps.camera.data.MapboxNavigationViewportDataSource
import com.mapbox.navigation.ui.maps.location.NavigationLocationProvider
import com.mapbox.navigation.ui.maps.route.arrow.api.MapboxRouteArrowApi
import com.mapbox.navigation.ui.maps.route.arrow.api.MapboxRouteArrowView
import com.mapbox.navigation.ui.maps.route.arrow.model.RouteArrowOptions
import com.mapbox.navigation.ui.maps.route.line.api.MapboxRouteLineApi
import com.mapbox.navigation.ui.maps.route.line.api.MapboxRouteLineView
import com.mapbox.navigation.ui.maps.route.line.model.MapboxRouteLineApiOptions
import com.mapbox.navigation.ui.maps.route.line.model.MapboxRouteLineViewOptions
import com.mapbox.navigation.voice.api.MapboxSpeechApi
import com.mapbox.navigation.voice.api.MapboxVoiceInstructionsPlayer
import com.mapbox.navigation.voice.model.SpeechAnnouncement
import com.mapbox.navigation.voice.model.SpeechVolume
import java.util.Locale
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.math.abs
import kotlin.math.roundToInt

@SuppressLint("ViewConstructor")
class DrivestNavigationView(private val reactContext: ReactContext) : FrameLayout(reactContext) {
  companion object {
    private const val TAG = "DrivestNavigationView"
    private const val STORED_ROUTE_SOURCE_ID = "drivest-stored-route-source"
    private const val STORED_ROUTE_LAYER_ID = "drivest-stored-route-layer"
    private const val START_MARKER_SOURCE_ID = "drivest-start-marker-source"
    private const val STOP_MARKER_SOURCE_ID = "drivest-stop-marker-source"
    private const val START_MARKER_LAYER_ID = "drivest-start-marker-layer"
    private const val STOP_MARKER_LAYER_ID = "drivest-stop-marker-layer"
    private const val ACTIVE_ROUTE_LAYER_ID = "mapbox-navigation-route-line-main-layer"
    private val navigationProviderInitialized = AtomicBoolean(false)
    private const val MAX_ROUTE_REQUEST_POINTS = 25
    private const val TO_START_REROUTE_MIN_INTERVAL_MS = 20000L
    private const val TO_START_REROUTE_MIN_DISTANCE_M = 120.0
    private const val TO_START_REROUTE_FREEZE_WITHIN_M = 250.0
    private const val TO_START_ORIGIN_MAX_DISTANCE_FROM_USER_M = 120.0
    private const val TO_START_DESTINATION_MAX_DISTANCE_FROM_ROUTE_START_M = 6.0
    private const val DESTINATION_CHANGE_THRESHOLD_M = 8.0
    private const val ROUTE_APPLY_DEBOUNCE_MS = 500L
    private const val LOCATION_FRESHNESS_MAX_MS = 3_000L
    private const val PREVIEW_MIN_ZOOM = 11.0
    private const val PREVIEW_MAX_ZOOM = 18.0
    private const val VOICE_DEDUPE_COOLDOWN_MS = 10_000L
    private const val VOICE_DEDUPE_MAX_ENTRIES = 128
    private const val MANEUVER_TOP_MARGIN_DP = 0
    private const val MANEUVER_SIDE_MARGIN_DP = 8
    private const val MANEUVER_HEIGHT_DP = 72
    private const val TRIP_PROGRESS_BOTTOM_MARGIN_DP = 8
    private const val TRIP_PROGRESS_SIDE_MARGIN_DP = 12
    private const val TRIP_PROGRESS_MIN_HEIGHT_DP = 52
    private const val MANEUVER_MAX_WIDTH_RATIO = 0.84
    private const val TRIP_PROGRESS_MAX_WIDTH_RATIO = 0.76
    private const val AUDIO_GUIDANCE_TOP_MARGIN_DP = 188
    private const val AUDIO_GUIDANCE_SIDE_MARGIN_DP = 16
    private const val AUDIO_GUIDANCE_SIZE_DP = 54
    private const val CAMERA_CONTROL_SIDE_MARGIN_DP = 14
    private const val CAMERA_CONTROL_BOTTOM_MARGIN_DP = 190
    private const val CAMERA_CONTROL_GAP_DP = 12
    private const val CAMERA_CONTROL_SIZE_DP = 52
    private const val SPEEDOMETER_SIZE_DP = 76
    private const val SPEEDOMETER_TOP_MARGIN_DP = 16
    private const val RIGHT_INFO_SIDE_MARGIN_DP = 16
    private const val RIGHT_INFO_BOTTOM_MARGIN_DP = 186
    private const val RIGHT_INFO_GAP_DP = 10
    private const val WAY_NAME_MIN_WIDTH_DP = 170
    private const val ROAD_ALERT_MIN_WIDTH_DP = 170
    private const val ROAD_ALERT_SLOW_DOWN_THRESHOLD_M = 120.0
    private const val FOLLOWING_TOP_PADDING_DP = 320.0
    private const val FOLLOWING_SIDE_PADDING_DP = 36.0
    private const val FOLLOWING_BOTTOM_PADDING_DP = 90.0
    private const val OVERVIEW_TOP_PADDING_DP = 120.0
    private const val OVERVIEW_SIDE_PADDING_DP = 56.0
    private const val OVERVIEW_BOTTOM_PADDING_DP = 120.0
    // Google/Waze-like camera behavior: keep a stable cruise zoom on straights,
    // then progressively zoom in as the next maneuver approaches.
    private const val TURN_ZOOM_PREP_THRESHOLD_M = 240.0
    private const val TURN_ZOOM_FAR_THRESHOLD_M = 110.0
    private const val TURN_ZOOM_NEAR_THRESHOLD_M = 38.0
    private const val TURN_ZOOM_FAR = 17.9
    private const val TURN_ZOOM_NEAR = 18.65
    private const val STRAIGHT_ZOOM_SLOW = 17.45
    private const val STRAIGHT_ZOOM_FAST = 16.95
    private const val STRAIGHT_ZOOM_FAST_SPEED_MPS = 31.0
    private const val FOLLOWING_ZOOM_MIN = 16.9
    private const val FOLLOWING_ZOOM_MAX = 18.7
    private const val FOLLOWING_ZOOM_SMOOTHING = 0.35
    private const val TURN_ZOOM_EPSILON = 0.05
    private const val ENABLE_ROAD_INTELLIGENCE_WIDGETS = true
  }

  // Force TextureView rendering so native navigation widgets (banner/trip progress/audio)
  // remain visible above the map surface in RN container hierarchies.
  private val mapView: MapView =
    MapView(reactContext, MapInitOptions(context = reactContext, textureView = true))
  private val deviceLocale: Locale = resolvePreferredLocale()
  private val routeLanguageTag: String = resolvePreferredRouteLanguageTag(deviceLocale)
  private val navigationLocationProvider = NavigationLocationProvider()
  private val routeLineApi = MapboxRouteLineApi(
    MapboxRouteLineApiOptions.Builder()
      // Keep full corridor stable; vanishing line can visually lag behind puck at speed.
      .vanishingRouteLineEnabled(false)
      .build()
  )
  private val routeLineView = MapboxRouteLineView(
    MapboxRouteLineViewOptions.Builder(reactContext).build()
  )
  private val routeArrowApi = MapboxRouteArrowApi()
  private val routeArrowView = MapboxRouteArrowView(RouteArrowOptions.Builder(reactContext).build())
  private val distanceFormatterOptions = DistanceFormatterOptions.Builder(reactContext)
    .unitType(UnitType.IMPERIAL)
    .locale(deviceLocale)
    .build()
  private val maneuverApi = MapboxManeuverApi(
    MapboxDistanceFormatter(distanceFormatterOptions),
    ManeuverOptions.Builder().build()
  )
  private val tripProgressFormatter = TripProgressUpdateFormatter.Builder(reactContext)
    .distanceRemainingFormatter(DistanceRemainingFormatter(distanceFormatterOptions))
    .timeRemainingFormatter(TimeRemainingFormatter(reactContext))
    .estimatedTimeToArrivalFormatter(EstimatedTimeToArrivalFormatter(reactContext))
    .build()
  private val tripProgressApi = MapboxTripProgressApi(tripProgressFormatter)
  private val maneuverView = MapboxManeuverView(reactContext)
  private val fallbackManeuverBannerView = createFallbackManeuverBannerView()
  private val audioGuidanceButton = MapboxAudioGuidanceButton(reactContext)
  private val controlStack = LinearLayout(reactContext).apply {
    orientation = LinearLayout.VERTICAL
    gravity = Gravity.CENTER
  }
  private val followControlButton = createFloatingControlButton(com.drivest.app.R.drawable.ic_nav_compass_white)
  private val overviewControlButton = createFloatingControlButton(com.drivest.app.R.drawable.ic_nav_overview_white)
  private val muteControlButton = createFloatingControlButton(android.R.drawable.ic_lock_silent_mode_off)
  private val speedometerView = createSpeedometerView()
  private val tripProgressView = MapboxTripProgressView(reactContext)
  private val previewTripSummaryView = createPreviewTripSummaryView()
  private val rightInfoStack = LinearLayout(reactContext).apply {
    orientation = LinearLayout.VERTICAL
    gravity = Gravity.END
  }
  private val speedInfoView = instantiateOptionalNativeView(
    "com.mapbox.navigation.ui.components.speedlimit.view.MapboxSpeedInfoView"
  )
  private val wayNameView = createWayNameView()
  private val roadAlertView = createRoadAlertView()
  private val recenterButton: View? by lazy {
    instantiateOptionalNativeView("com.mapbox.navigation.ui.maps.camera.view.MapboxRecenterButton")
  }
  private val overviewButton: View? by lazy {
    instantiateOptionalNativeView("com.mapbox.navigation.ui.maps.camera.view.MapboxRouteOverviewButton")
  }

  private var viewportDataSource: MapboxNavigationViewportDataSource? = null
  private var navigationCamera: NavigationCamera? = null

  private var mapboxNavigation: MapboxNavigation? = null
  private var speechApi: MapboxSpeechApi? = null
  private var voiceInstructionsPlayer: MapboxVoiceInstructionsPlayer? = null
  private var accessTokenOverride: String? = null
  private var styleURL: String = Style.MAPBOX_STREETS
  private var navigationMode: String? = "PREVIEW"
  private var origin: Point? = null
  private var destination: Point? = null
  private var destinationName: String? = null
  private val waypoints: MutableList<Point> = CopyOnWriteArrayList()
  private var routeCoordinates: List<Point> = emptyList()
  private var storedRouteStartPoint: Point? = null
  private var shouldSimulate = false
  private var isMuted = false
  private var rerouteEnabled = false
  private var isViewStarted = false
  private var isMapStarted = false
  private var isStyleLoaded = false
  private var pendingRoutes: List<NavigationRoute>? = null
  private var requestedRouteSignature: String? = null
  private var latestVoiceInstructionText: String? = null
  private var latestVoiceInstructionSsml: String? = null
  private var latestVoiceDistanceAlongGeometry: Double? = null
  private var latestEnhancedLocation: Location? = null
  private var lastRoadAlertText: String? = null
  private var lastWayNameText: String? = null
  private var latestRouteDistanceRemainingM: Double? = null
  private var latestRouteFractionTraveled: Double = 0.0
  private var voiceInstructionSequence: Long = 0L
  private val recentVoiceInstructionKeys = LinkedHashMap<String, Long>()
  private var activeTripSessionMode: String = "STOPPED"
  private val speedInfoApi: Any? by lazy {
    instantiateClass(
      "com.mapbox.navigation.tripdata.speedlimit.api.MapboxSpeedInfoApi"
    )
  }
  private var observersRegistered = false
  private var routeRequestInFlight = false
  private var routeRequestQueued = false
  private var routeRequestEvaluationScheduled = false
  private var routeRequestSequence: Long = 0L
  private var activeRouteRequestId: Long = 0L
  private var routeApplySequence: Long = 0L
  private var activeRouteApplySequence: Long = 0L
  private var pendingRouteApplyRequestId: Long = 0L
  private var pendingRouteApplyMode: String? = null
  private var pendingRouteApplyRoutes: List<NavigationRoute>? = null
  private var pendingRouteApplySource: String = "unknown"
  private var routeApplyScheduled = false
  private var lastRouteApplyAtMs: Long = 0L
  private var suppressRoutesObserverRenderUntilMs: Long = 0L
  private var currentActiveRouteId: String? = null
  private var routeLineSetSequence: Long = 0L
  private var lastToStartRequestOrigin: Point? = null
  private var lastToStartRequestDestination: Point? = null
  private var lastToStartRequestAtMs: Long = 0L
  private var toStartEnteredAtElapsedMs: Long = 0L
  private var originUpdatedAtElapsedMs: Long = 0L
  private var destinationUpdatedAtElapsedMs: Long = 0L
  private var destinationNameUpdatedAtElapsedMs: Long = 0L
  private var primaryRoute: NavigationRoute? = null
  private var primaryRouteId: String? = null
  private var routeLinePrimaryRouteId: String? = null
  private var primaryRouteMode: String? = null
  private var lastAppliedNavigationRouteId: String? = null
  private var lastAppliedNavigationMode: String? = null
  private var lastAppliedNavigationRouteCount: Int = 0
  private var isFollowingCameraRequested = false
  private var isOverviewCameraRequested = false
  private var isNorthUpLocked = false
  private var nativeManeuverCount = 0
  private var lastLoggedBannerVisibility: Boolean? = null
  private var lastLoggedFallbackBannerVisibility: Boolean? = null
  private var lastLoggedBannerMeasuredWidth: Int = -1
  private var lastLoggedBannerMeasuredHeight: Int = -1
  private var latestInstructionPrimaryText: String? = null
  private var latestInstructionSecondaryText: String? = null
  private var latestInstructionDistanceM: Double? = null
  private var waitingForFreshLocationToStartTrip = false
  private var lastEnhancedLocationUpdateAtMs: Long = 0L
  private var lastEnhancedLocationAccuracyM: Double? = null
  private var lastEnhancedLocationFixElapsedNs: Long? = null
  private var lastStaleLocationLogAtMs: Long = 0L
  private var activeFollowingZoomOverride: Double? = null
  private var followingCameraPadding: EdgeInsets? = null
  private var overviewCameraPadding: EdgeInsets? = null
  private var lastPuckLayerEnsureAtMs: Long = 0L
  private var waitingForLayoutToStartTrip = false
  private var lastLoggedRootWidth: Int = -1
  private var lastLoggedRootHeight: Int = -1
  private var lastLoggedRootStage: String? = null
  private var lastLoggedProgressRouteId: String? = null
  private var lastToStartInflightSkipLogAtMs: Long = 0L
  private var hasLoggedMissingNavigationToken: Boolean = false

  private val locationObserver = object : LocationObserver {
    override fun onNewRawLocation(rawLocation: Location) {
      // No-op: use enhanced location for guidance UI.
    }

    override fun onNewLocationMatcherResult(locationMatcherResult: LocationMatcherResult) {
      latestEnhancedLocation = locationMatcherResult.enhancedLocation
      lastEnhancedLocationUpdateAtMs = System.currentTimeMillis()
      lastEnhancedLocationAccuracyM =
        readNumberProperty(locationMatcherResult.enhancedLocation, "horizontalAccuracy")
          ?: readNumberProperty(locationMatcherResult.enhancedLocation, "accuracy")
      val locationTimestamp = readNumberProperty(locationMatcherResult.enhancedLocation, "timestamp")
      // Mapbox common Location timestamp is elapsedRealtime nanos on Android.
      lastEnhancedLocationFixElapsedNs =
        locationTimestamp?.toLong()?.takeIf { it > 10_000_000_000L }
      updateSpeedometer(locationMatcherResult.enhancedLocation)
      if (ENABLE_ROAD_INTELLIGENCE_WIDGETS) {
        updateSpeedInfo(locationMatcherResult)
      } else {
        speedInfoView?.visibility = View.GONE
      }
      try {
        navigationLocationProvider.changePosition(
          locationMatcherResult.enhancedLocation,
          locationMatcherResult.keyPoints
        )
      } catch (_: Exception) {
        // Keep compatibility across SDK minor versions.
      }
      try {
        viewportDataSource?.onLocationChanged(locationMatcherResult.enhancedLocation)
        viewportDataSource?.evaluate()
      } catch (_: Exception) {
        // Keep compatibility across SDK minor versions.
      }
      if (navigationMode == "TO_START" || navigationMode == "ON_ROUTE") {
        // Keep camera in stable following mode; avoid periodic forced resets that can
        // cause puck anchoring flicker between center and lower-third.
        requestFollowingCameraIfNeeded()
        if (isNorthUpLocked) {
          enforceNorthUpCameraFallback()
        } else {
          enforceHeadingUpCameraFallback(locationMatcherResult.enhancedLocation)
        }
        enforceActiveNavigationUi("location-update")
      } else {
        requestFollowingCameraIfNeeded()
        applyNorthUpGestureLock()
      }
      if (waitingForFreshLocationToStartTrip) {
        applyTripSessionMode()
      }
    }
  }

  private val routesObserver = RoutesObserver { routesUpdatedResult ->
    val routes = routesUpdatedResult.navigationRoutes
    val observedPrimaryRoute = routes.firstOrNull()
    val observedPrimaryRouteId = getNavigationRouteId(observedPrimaryRoute)
    primaryRoute = observedPrimaryRoute
    primaryRouteId = observedPrimaryRouteId
    primaryRouteMode = if (primaryRoute == null) null else navigationMode
    if (!isViewStarted || !isStyleLoaded) {
      pendingRoutes = routes
      return@RoutesObserver
    }
    val now = System.currentTimeMillis()
    if (
      now < suppressRoutesObserverRenderUntilMs &&
      !observedPrimaryRouteId.isNullOrBlank() &&
      observedPrimaryRouteId == currentActiveRouteId
    ) {
      return@RoutesObserver
    }
    if (
      !observedPrimaryRouteId.isNullOrBlank() &&
      !currentActiveRouteId.isNullOrBlank() &&
      observedPrimaryRouteId != currentActiveRouteId
    ) {
      Log.w(
        TAG,
        "RoutesObserver ignored unexpected route id=$observedPrimaryRouteId activeRouteId=$currentActiveRouteId"
      )
      return@RoutesObserver
    }
    runOnMainThread {
      // IMPORTANT: Do not feed RouteLineApi from RoutesObserver.
      // Route-line updates must stay in the explicit applyRoutes pipeline only,
      // otherwise observer-emitted route instances can desync from routeProgress IDs.
      val route = primaryRoute
      if (route != null) {
        renderNativeNavigationWidgetsFromRoute(route)
        try {
          viewportDataSource?.onRouteChanged(route)
          viewportDataSource?.evaluate()
        } catch (_: Exception) {
          // Keep compatibility across SDK minor versions.
        }
      }
    }
  }

  private val routeProgressObserver = RouteProgressObserver { progress ->
    runOnMainThread {
      if (!isAttachedToWindow) {
        return@runOnMainThread
      }
      if (!hasUsableLayout()) {
        logRootSize("routeProgress-no-layout")
      }
      renderNativeNavigationWidgets(progress)
      updateTripProgress(progress)
      ensureBottomBannerVisible(extractRouteFromProgress(progress) ?: primaryRoute)
      if (ENABLE_ROAD_INTELLIGENCE_WIDGETS) {
        updateRoadAlertFromProgress(progress)
        updateWayNameFromProgress(progress)
      } else {
        roadAlertView.visibility = View.GONE
        wayNameView.visibility = View.GONE
        lastWayNameText = null
      }
      renderRouteProgress(progress)
      updateManeuverAwareZoom(progress)
      hideUndesiredNativeWidgets()
      syncManeuverBannerVisibility("route-progress-observer")
      enforceActiveNavigationUi("route-progress-observer")
      bringNativeOverlaysToFront()
      latestRouteDistanceRemainingM = progress.distanceRemaining.toDouble()
      latestRouteFractionTraveled = progress.fractionTraveled.toDouble()

      val payload = Arguments.createMap()
      latestEnhancedLocation?.let { location ->
        payload.putDouble("latitude", location.latitude)
        payload.putDouble("longitude", location.longitude)
      }

      payload.putDouble("distanceRemaining", progress.distanceRemaining.toDouble())
      payload.putDouble("durationRemaining", progress.durationRemaining.toDouble())
      payload.putDouble("fractionTraveled", progress.fractionTraveled.toDouble())

      val stepProgress = progress.currentLegProgress?.currentStepProgress
      val bannerPrimary = sanitizeForUi(progress.bannerInstructions?.primary()?.text())
      val bannerSecondary = sanitizeForUi(progress.bannerInstructions?.secondary()?.text())
      val stepInstruction = sanitizeForUi(stepProgress?.step?.maneuver()?.instruction())
      val stepRoadName = sanitizeForUi(stepProgress?.step?.name())
      val stepRemaining = stepProgress?.distanceRemaining
      val maneuver = stepProgress?.step?.maneuver()

      val nextInstruction = bannerPrimary ?: stepInstruction
      latestInstructionPrimaryText = nextInstruction
      if (!nextInstruction.isNullOrBlank()) {
        payload.putString("instruction", nextInstruction)
      }

      val nextSecondary = bannerSecondary ?: stepRoadName
      latestInstructionSecondaryText = nextSecondary
      if (!nextSecondary.isNullOrBlank()) {
        payload.putString("instructionSecondary", nextSecondary)
      }

      if (stepRemaining != null) {
        latestInstructionDistanceM = stepRemaining.toDouble()
        payload.putDouble("distanceToInstruction", stepRemaining.toDouble())
      } else {
        latestInstructionDistanceM = null
      }

      if (maneuver != null) {
        maneuver.type()?.let { payload.putString("maneuverType", it) }
        maneuver.modifier()?.let { payload.putString("maneuverModifier", it) }
        maneuver.exit()?.let { payload.putInt("roundaboutExit", it) }
      }

      latestVoiceInstructionText?.let {
        payload.putString("voiceInstruction", it)
        payload.putString("voiceInstructionText", it)
      }
      latestVoiceInstructionSsml?.let {
        payload.putString("voiceInstructionSsml", it)
      }
      latestVoiceDistanceAlongGeometry?.let {
        payload.putDouble("voiceDistanceAlongGeometry", it)
      }

      appendNativeUiTelemetry(payload)
      emitProgressChange(payload)
    }
  }

  private val voiceInstructionsObserver = VoiceInstructionsObserver { voiceInstructions ->
    latestVoiceInstructionSsml = voiceInstructions.ssmlAnnouncement()
    latestVoiceInstructionText = sanitizeForUi(
      voiceInstructions.announcement() ?: voiceInstructions.ssmlAnnouncement()
    )
    if (latestInstructionPrimaryText.isNullOrBlank()) {
      latestInstructionPrimaryText = latestVoiceInstructionText
    }
    latestVoiceDistanceAlongGeometry = voiceInstructions.distanceAlongGeometry()?.toDouble()
    playVoiceInstruction(voiceInstructions)

    // Emit voice updates immediately even if route-progress cadence is slower.
    runOnMainThread {
      if (!hasUsableLayout()) {
        logRootSize("voiceUpdate-no-layout")
        return@runOnMainThread
      }
      val payload = Arguments.createMap()
      latestEnhancedLocation?.let { location ->
        payload.putDouble("latitude", location.latitude)
        payload.putDouble("longitude", location.longitude)
      }
      latestVoiceInstructionText?.let {
        payload.putString("voiceInstruction", it)
        payload.putString("voiceInstructionText", it)
      }
      latestVoiceInstructionSsml?.let { payload.putString("voiceInstructionSsml", it) }
      latestVoiceDistanceAlongGeometry?.let { payload.putDouble("voiceDistanceAlongGeometry", it) }
      appendNativeUiTelemetry(payload)
      emitProgressChange(payload)
    }
  }

  init {
    if (id == View.NO_ID) {
      id = View.generateViewId()
    }
    if (layoutParams == null) {
      layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT)
    }

    addView(
      mapView,
      LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT)
    )
    mapView.layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT)
    requestLayout()
    invalidate()
    addOnLayoutChangeListener { _, left, top, right, bottom, _, _, _, _ ->
      val w = right - left
      val h = bottom - top
      if (w > 0 && h > 0) {
        if (waitingForLayoutToStartTrip) {
          waitingForLayoutToStartTrip = false
          applyTripSessionMode()
        }
        if (routeRequestQueued && !routeRequestInFlight && isViewStarted) {
          scheduleRouteRequestEvaluation()
        }
        ensureManeuverBannerLayout()
        ensureBottomBannerLayout()
        maneuverView.requestLayout()
        tripProgressView.requestLayout()
        previewTripSummaryView.requestLayout()
        bringNativeOverlaysToFront()
      }
    }
    initializeNativeNavigationUi()

    initializeMapUi()
    ensureNavigation()
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    isViewStarted = true
    val currentLayoutParams = layoutParams as? ViewGroup.MarginLayoutParams
    if (
      currentLayoutParams == null ||
      currentLayoutParams.width != LayoutParams.MATCH_PARENT ||
      currentLayoutParams.height != LayoutParams.MATCH_PARENT
    ) {
      layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT)
      requestLayout()
    }
    logRootSize("onAttachedToWindow")
    if (!isMapStarted) {
      mapView.onStart()
      isMapStarted = true
    }
    ensureNavigation()
    registerObservers()
    if (routeRequestQueued || requestedRouteSignature == null) {
      scheduleRouteRequestEvaluation()
    }
    pendingRoutes?.let {
      applyRoutes(it)
      pendingRoutes = null
    }
    post {
      hideUndesiredNativeWidgets()
      bringNativeOverlaysToFront()
    }
  }

  override fun onDetachedFromWindow() {
    isViewStarted = false
    unregisterObservers()
    // Detach can happen transiently during RN layout/reparent updates.
    // Do not clear routes / trip session here or the active guidance UI
    // (maneuver banner + trip progress) will disappear unexpectedly.
    // Full teardown is handled in onDropViewInstance().
    if (isMapStarted) {
      mapView.onStop()
      isMapStarted = false
    }
    super.onDetachedFromWindow()
  }

  override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
    super.onSizeChanged(w, h, oldw, oldh)
    logRootSize("onSizeChanged")
    if (w <= 0 || h <= 0) return
    applyViewportPadding()
    post { requestPreferredCameraForMode(force = true) }
  }

  override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
    val fallbackWidth = maxOf(resources.displayMetrics.widthPixels, 1)
    val fallbackHeight = maxOf(resources.displayMetrics.heightPixels, 1)
    val resolvedWidthSpec =
      if (
        View.MeasureSpec.getMode(widthMeasureSpec) == View.MeasureSpec.UNSPECIFIED ||
        View.MeasureSpec.getSize(widthMeasureSpec) <= 0
      ) {
        View.MeasureSpec.makeMeasureSpec(fallbackWidth, View.MeasureSpec.EXACTLY)
      } else {
        widthMeasureSpec
      }
    val resolvedHeightSpec =
      if (
        View.MeasureSpec.getMode(heightMeasureSpec) == View.MeasureSpec.UNSPECIFIED ||
        View.MeasureSpec.getSize(heightMeasureSpec) <= 0
      ) {
        View.MeasureSpec.makeMeasureSpec(fallbackHeight, View.MeasureSpec.EXACTLY)
      } else {
        heightMeasureSpec
      }
    super.onMeasure(resolvedWidthSpec, resolvedHeightSpec)
  }

  override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) {
    super.onLayout(changed, left, top, right, bottom)
    if (changed) {
      logRootSize("onLayout")
    }
  }

  fun onDropViewInstance() {
    unregisterObservers()
    pendingRoutes = null
    stopGuidanceSafely()
    if (isMapStarted) {
      mapView.onStop()
      isMapStarted = false
    }
    voiceInstructionsPlayer?.shutdown()
    voiceInstructionsPlayer = null
    speechApi?.cancel()
    speechApi = null
    maneuverApi.cancel()
    mapView.onDestroy()
  }

  private fun initializeNativeNavigationUi() {
    syncManeuverBannerVisibility("initialize")
    // Hide SDK-provided audio button; use left stack mute control for a consistent layout.
    audioGuidanceButton.visibility = View.GONE

    val maneuverLayoutParams = LayoutParams(
      LayoutParams.WRAP_CONTENT,
      LayoutParams.WRAP_CONTENT
    ).apply {
      gravity = Gravity.TOP or Gravity.CENTER_HORIZONTAL
      setMargins(
        dpToPxInt(MANEUVER_SIDE_MARGIN_DP.toDouble()),
        dpToPxInt(MANEUVER_TOP_MARGIN_DP.toDouble()),
        dpToPxInt(MANEUVER_SIDE_MARGIN_DP.toDouble()),
        0
      )
    }
    addView(maneuverView, maneuverLayoutParams)
    maneuverView.minimumHeight = dpToPxInt(MANEUVER_HEIGHT_DP.toDouble())
    ensureManeuverBannerLayout()
    maneuverView.addOnLayoutChangeListener { _, left, top, right, bottom, _, _, _, _ ->
      val w = right - left
      val h = bottom - top
      if (w <= 0 || h <= 0) return@addOnLayoutChangeListener
      if (w != lastLoggedBannerMeasuredWidth || h != lastLoggedBannerMeasuredHeight) {
        lastLoggedBannerMeasuredWidth = w
        lastLoggedBannerMeasuredHeight = h
        Log.i(TAG, "Maneuver banner laid out: ${w}x${h}")
      }
    }
    val fallbackLayoutParams = LayoutParams(maneuverLayoutParams)
    addView(fallbackManeuverBannerView, fallbackLayoutParams)
    fallbackManeuverBannerView.visibility = View.GONE
    fallbackManeuverBannerView.elevation = dpToPx(12.0).toFloat()
    fallbackManeuverBannerView.translationZ = dpToPx(12.0).toFloat()

    val controlChildParams = LinearLayout.LayoutParams(
      dpToPxInt(CAMERA_CONTROL_SIZE_DP.toDouble()),
      dpToPxInt(CAMERA_CONTROL_SIZE_DP.toDouble())
    )
    controlStack.addView(followControlButton, controlChildParams)
    controlStack.addView(
      overviewControlButton,
      LinearLayout.LayoutParams(controlChildParams).apply {
        topMargin = dpToPxInt(CAMERA_CONTROL_GAP_DP.toDouble())
      }
    )
    controlStack.addView(
      muteControlButton,
      LinearLayout.LayoutParams(controlChildParams).apply {
        topMargin = dpToPxInt(CAMERA_CONTROL_GAP_DP.toDouble())
      }
    )
    controlStack.addView(
      speedometerView,
      LinearLayout.LayoutParams(
        dpToPxInt(SPEEDOMETER_SIZE_DP.toDouble()),
        dpToPxInt(SPEEDOMETER_SIZE_DP.toDouble())
      ).apply {
        topMargin = dpToPxInt(SPEEDOMETER_TOP_MARGIN_DP.toDouble())
      }
    )

    val controlStackLayoutParams = LayoutParams(
      LayoutParams.WRAP_CONTENT,
      LayoutParams.WRAP_CONTENT
    ).apply {
      gravity = Gravity.BOTTOM or Gravity.START
      setMargins(
        dpToPxInt(CAMERA_CONTROL_SIDE_MARGIN_DP.toDouble()),
        0,
        0,
        dpToPxInt(CAMERA_CONTROL_BOTTOM_MARGIN_DP.toDouble())
      )
    }
    addView(controlStack, controlStackLayoutParams)
    controlStack.visibility = View.VISIBLE
    controlStack.elevation = dpToPx(10.0).toFloat()
    controlStack.translationZ = dpToPx(10.0).toFloat()
    muteControlButton.contentDescription = "Mute guidance"
    followControlButton.contentDescription = "Follow location"
    overviewControlButton.contentDescription = "Overview"

    audioGuidanceButton.setOnClickListener {
      setIsMuted(!isMuted)
    }
    followControlButton.setOnClickListener { handleFollowControlTap() }
    overviewControlButton.setOnClickListener {
      requestOverviewCamera(force = true)
    }
    muteControlButton.setOnClickListener {
      setIsMuted(!isMuted)
    }

    val tripProgressLayoutParams = LayoutParams(
      LayoutParams.WRAP_CONTENT,
      LayoutParams.WRAP_CONTENT
    ).apply {
      gravity = Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL
      setMargins(
        dpToPxInt(TRIP_PROGRESS_SIDE_MARGIN_DP.toDouble()),
        0,
        dpToPxInt(TRIP_PROGRESS_SIDE_MARGIN_DP.toDouble()),
        dpToPxInt(TRIP_PROGRESS_BOTTOM_MARGIN_DP.toDouble())
      )
    }
    addView(tripProgressView, tripProgressLayoutParams)
    tripProgressView.minimumHeight = dpToPxInt(TRIP_PROGRESS_MIN_HEIGHT_DP.toDouble())
    tripProgressView.visibility = View.GONE
    tripProgressView.elevation = dpToPx(10.0).toFloat()
    tripProgressView.translationZ = dpToPx(10.0).toFloat()
    addView(previewTripSummaryView, tripProgressLayoutParams)
    previewTripSummaryView.visibility = View.GONE
    previewTripSummaryView.elevation = dpToPx(10.0).toFloat()
    previewTripSummaryView.translationZ = dpToPx(10.0).toFloat()
    ensureBottomBannerLayout()

    if (ENABLE_ROAD_INTELLIGENCE_WIDGETS) {
      wayNameView.visibility = View.GONE
      rightInfoStack.addView(
        wayNameView,
        LinearLayout.LayoutParams(
          LayoutParams.WRAP_CONTENT,
          LayoutParams.WRAP_CONTENT
        )
      )
      speedInfoView?.let { view ->
        view.visibility = View.GONE
        rightInfoStack.addView(
          view,
          LinearLayout.LayoutParams(
            LayoutParams.WRAP_CONTENT,
            LayoutParams.WRAP_CONTENT
          ).apply {
            topMargin = dpToPxInt(RIGHT_INFO_GAP_DP.toDouble())
          }
        )
      }
      rightInfoStack.addView(
        roadAlertView,
        LinearLayout.LayoutParams(
          LayoutParams.WRAP_CONTENT,
          LayoutParams.WRAP_CONTENT
        ).apply {
          topMargin = dpToPxInt(RIGHT_INFO_GAP_DP.toDouble())
        }
      )

      val rightInfoLayoutParams = LayoutParams(
        LayoutParams.WRAP_CONTENT,
        LayoutParams.WRAP_CONTENT
      ).apply {
        gravity = Gravity.BOTTOM or Gravity.END
        setMargins(
          dpToPxInt(RIGHT_INFO_SIDE_MARGIN_DP.toDouble()),
          0,
          dpToPxInt(RIGHT_INFO_SIDE_MARGIN_DP.toDouble()),
          dpToPxInt(RIGHT_INFO_BOTTOM_MARGIN_DP.toDouble())
        )
      }
      addView(rightInfoStack, rightInfoLayoutParams)
      rightInfoStack.visibility = View.VISIBLE
      rightInfoStack.elevation = dpToPx(10.0).toFloat()
      rightInfoStack.translationZ = dpToPx(10.0).toFloat()
    } else {
      rightInfoStack.visibility = View.GONE
      wayNameView.visibility = View.GONE
      roadAlertView.visibility = View.GONE
      speedInfoView?.visibility = View.GONE
    }

    bringNativeOverlaysToFront()
    hideUndesiredNativeWidgets()
    applyVoiceUiState()
    updateFollowControlUiState()
  }

  private fun initializeMapUi() {
    viewportDataSource = MapboxNavigationViewportDataSource(mapView.getMapboxMap())
    navigationCamera = NavigationCamera(
      mapView.getMapboxMap(),
      mapView.camera,
      viewportDataSource ?: return
    )
    bindOptionalCameraButtons()

    mapView.location.setLocationProvider(navigationLocationProvider)
    mapView.location.updateSettings {
      enabled = true
      locationPuck = createNavigationArrowPuck()
      puckBearingEnabled = true
      pulsingEnabled = false
      showAccuracyRing = false
      // HEADING keeps a directional arrow visible even at low speed.
      puckBearing = PuckBearing.HEADING
    }
    ensureLocationPuckAboveRouteLine(force = true)
    applyNorthUpGestureLock()
    applyViewportPadding()

    reloadMapStyle()
  }

  private fun reloadMapStyle() {
    isStyleLoaded = false
    mapView.getMapboxMap().loadStyleUri(styleURL) { style ->
      isStyleLoaded = true
      routeLineView.initializeLayers(style)
      ensureLocationPuckAboveRouteLine(force = true)
      updateStoredRouteOverlay()
      applyViewportPadding()
      pendingRoutes?.let {
        renderNavigationRoutes(it)
        pendingRoutes = null
      }
      if (primaryRoute != null) {
        requestPreferredCameraForMode(force = true)
      }
      hideUndesiredNativeWidgets()
      ensureLocationPuckAboveRouteLine(force = true)
      applyNorthUpGestureLock()
      bringNativeOverlaysToFront()
    }
  }

  private fun ensureNavigation() {
    if (mapboxNavigation != null) return

    val token = resolveNavigationAccessToken()
    if (token.isNullOrBlank()) {
      if (!hasLoggedMissingNavigationToken) {
        Log.e(TAG, "Mapbox navigation disabled: no access token resolved (prop/buildConfig/resources)")
        hasLoggedMissingNavigationToken = true
      }
      return
    }
    hasLoggedMissingNavigationToken = false

    val optionsBuilder = NavigationOptions.Builder(reactContext)
    // Keep compatibility across Navigation SDK patch versions where token setter names differ.
    invokeIfPresent(optionsBuilder, "accessToken", token)
    invokeIfPresent(optionsBuilder, "setAccessToken", token)
    val options = optionsBuilder.build()

    if (navigationProviderInitialized.compareAndSet(false, true)) {
      try {
        MapboxNavigationProvider.create(options)
      } catch (_: IllegalStateException) {
        // Provider may already be initialized.
      }
    }

    mapboxNavigation = try {
      MapboxNavigationProvider.retrieve()
    } catch (_: IllegalStateException) {
      try {
        MapboxNavigationProvider.create(options)
      } catch (_: IllegalStateException) {
        // no-op
      }
      try {
        MapboxNavigationProvider.retrieve()
      } catch (_: IllegalStateException) {
        null
      }
    }

    initializeVoiceApis(token)
    if (isViewStarted) {
      registerObservers()
    }
    applyMutedPreferenceIfSupported(mapboxNavigation)
    applyVoiceUiState()
  }

  private fun resolveNavigationAccessToken(): String? {
    val overrideToken = accessTokenOverride?.trim()?.takeIf { it.isNotEmpty() }
    if (overrideToken != null) return overrideToken

    val buildToken = BuildConfig.MAPBOX_ACCESS_TOKEN?.trim()?.takeIf { it.isNotEmpty() }
    if (buildToken != null) return buildToken

    val resourcesTokenId = reactContext.resources.getIdentifier(
      "mapbox_access_token",
      "string",
      reactContext.packageName
    )
    if (resourcesTokenId != 0) {
      val resourceToken = reactContext.getString(resourcesTokenId).trim().takeIf { it.isNotEmpty() }
      if (resourceToken != null) return resourceToken
    }

    return null
  }

  fun setAccessToken(value: String?) {
    accessTokenOverride = value
    if (mapboxNavigation == null) {
      ensureNavigation()
    }
  }

  fun setStyleURL(value: String?) {
    val next = value?.trim()?.takeIf { it.isNotEmpty() } ?: Style.MAPBOX_STREETS
    if (next == styleURL) return
    styleURL = next
    if (isMapStarted || isStyleLoaded) {
      reloadMapStyle()
    }
  }

  fun setNavigationMode(value: String?) {
    val previousMode = navigationMode
    navigationMode = value?.trim()?.uppercase()
    if (navigationMode != previousMode) {
      resetVoiceDedupCache()
    }
    if (navigationMode == "PREVIEW") {
      isFollowingCameraRequested = false
      isNorthUpLocked = false
      clearFollowingZoomOverride()
      updatePreviewTripSummary(primaryRoute)
      primaryRoute?.let { renderNativeNavigationWidgetsFromRoute(it) }
    } else if (navigationMode == "TO_START" || navigationMode == "ON_ROUTE") {
      isOverviewCameraRequested = false
      // Active navigation defaults to heading-up follow.
      isNorthUpLocked = false
      applyNorthUpViewportOverride()
      previewTripSummaryView.visibility = View.GONE
      primaryRoute?.let { renderNativeNavigationWidgetsFromRoute(it) }
      enforceActiveNavigationUi("mode-change")
    }
    applyNorthUpGestureLock()
    syncManeuverBannerVisibility("mode-change")
    if (navigationMode == "TO_START" && previousMode != "TO_START") {
      // Keep latest props/location so TO_START can request immediately even if
      // React prop update order is mode-last for this render.
      waitingForFreshLocationToStartTrip = false
      latestRouteDistanceRemainingM = null
      latestRouteFractionTraveled = 0.0
      lastToStartRequestOrigin = null
      lastToStartRequestDestination = null
      lastToStartRequestAtMs = 0L
      requestedRouteSignature = null
      lastAppliedNavigationRouteId = null
      lastAppliedNavigationMode = null
      lastAppliedNavigationRouteCount = 0
      toStartEnteredAtElapsedMs = SystemClock.elapsedRealtime()
      Log.i(TAG, "TO_START entered: reset guard state and evaluate route with current props")
    }
    if (navigationMode == "ON_ROUTE" && previousMode != "ON_ROUTE") {
      // Force a fresh ON_ROUTE request immediately after phase switch.
      // This avoids stale signatures from suppressing the first active-guidance route.
      latestRouteDistanceRemainingM = null
      latestRouteFractionTraveled = 0.0
      requestedRouteSignature = null
      routeRequestQueued = false
      lastAppliedNavigationRouteId = null
      lastAppliedNavigationMode = null
      lastAppliedNavigationRouteCount = 0
      toStartEnteredAtElapsedMs = 0L
      Log.i(TAG, "ON_ROUTE entered: forcing fresh guidance route request")
    }
    updateFollowControlUiState()
    // Always evaluate after mode changes; TO_START safeguards below prevent stale PREVIEW usage.
    if (navigationMode == "PREVIEW" || navigationMode == "TO_START" || navigationMode == "ON_ROUTE") {
      scheduleRouteRequestEvaluation()
    }
  }

  fun setOrigin(value: ReadableArray?) {
    origin = readPoint(value)
    originUpdatedAtElapsedMs = SystemClock.elapsedRealtime()
    scheduleRouteRequestEvaluation()
  }

  fun setDestination(value: ReadableArray?) {
    destination = readPoint(value)
    destinationUpdatedAtElapsedMs = SystemClock.elapsedRealtime()
    scheduleRouteRequestEvaluation()
  }

  fun setDestinationName(value: String?) {
    destinationName = value?.trim()?.takeIf { it.isNotEmpty() }
    destinationNameUpdatedAtElapsedMs = SystemClock.elapsedRealtime()
    scheduleRouteRequestEvaluation()
  }

  fun setWaypoints(value: ReadableArray?) {
    waypoints.clear()
    if (value == null) {
      scheduleRouteRequestEvaluation()
      return
    }
    for (i in 0 until value.size()) {
      val point = readPoint(value.getArray(i))
      if (point != null) waypoints.add(point)
    }
    scheduleRouteRequestEvaluation()
  }

  fun setRouteCoordinates(value: ReadableArray?) {
    routeCoordinates = parseRouteCoordinates(value)
    if (routeCoordinates.isNotEmpty()) {
      storedRouteStartPoint = routeCoordinates.first()
    }
    updateStoredRouteOverlay()
    scheduleRouteRequestEvaluation()
  }

  fun setShouldSimulateRoute(value: Boolean) {
    shouldSimulate = value
    applyTripSessionMode()
  }

  private fun scheduleRouteRequestEvaluation() {
    if (routeRequestEvaluationScheduled) return
    routeRequestEvaluationScheduled = true
    post {
      routeRequestEvaluationScheduled = false
      maybeRequestRoute()
    }
  }

  fun setIsMuted(value: Boolean) {
    isMuted = value
    applyMutedPreferenceIfSupported(mapboxNavigation)
    applyVoiceUiState()
  }

  fun setRerouteEnabled(value: Boolean) {
    rerouteEnabled = value
    mapboxNavigation?.let { applyReroutePreferenceIfSupported(it) }
  }

  private fun maybeRequestRoute() {
    val nav = mapboxNavigation ?: run {
      ensureNavigation()
      mapboxNavigation
    } ?: return
    if (!isViewStarted || !isAttachedToWindow) {
      routeRequestQueued = true
      return
    }
    if (!hasUsableLayout()) {
      routeRequestQueued = true
      return
    }
    if (routeRequestInFlight) {
      if (navigationMode == "TO_START") {
        val now = System.currentTimeMillis()
        if (now - lastToStartInflightSkipLogAtMs > 2000L) {
          Log.i(TAG, "TO_START request deferred: route request already in-flight")
          lastToStartInflightSkipLogAtMs = now
        }
        return
      }
      routeRequestQueued = true
      return
    }

    val requestedCoords = resolveRequestedCoordinates()
    if (requestedCoords.size < 2) return

    val activeMode = navigationMode.orEmpty()
    val isExplicitToStartMode = activeMode == "TO_START"
    val isToStartMode = isExplicitToStartMode
    if (isToStartMode) {
      val currentOrigin = requestedCoords.first()
      val currentDestination = requestedCoords.last()
      if (isExplicitToStartMode) {
        val requestedOrigin = origin
        val requestedDestination = destination
        if (requestedOrigin == null || requestedDestination == null) {
          Log.i(TAG, "TO_START request deferred: waiting for explicit origin/destination props")
          return
        }
        val enhancedLocation = latestEnhancedLocation
        val destinationLabel = destinationName?.trim()?.lowercase(Locale.US)
        if (destinationLabel != "starting point") {
          Log.i(
            TAG,
            "TO_START request deferred: waiting for destinationName='starting point' " +
              "(current='${destinationName ?: "null"}')"
          )
          return
        }
        val routeStart = storedRouteStartPoint ?: dedupePoints(routeCoordinates).firstOrNull()
        if (routeStart != null) {
          val destinationFromStartMeters = distanceMeters(currentDestination, routeStart)
          if (destinationFromStartMeters > TO_START_DESTINATION_MAX_DISTANCE_FROM_ROUTE_START_M) {
            Log.i(
              TAG,
              "TO_START request deferred: destination is not the route start " +
                "(shift=${"%.1f".format(Locale.US, destinationFromStartMeters)}m)"
            )
            return
          }
        }
        // If enhanced location is ready, keep strict validation. Otherwise allow
        // JS-provided origin to avoid TO_START deadlocks.
        if (enhancedLocation == null || lastEnhancedLocationUpdateAtMs <= 0L) {
          Log.i(TAG, "TO_START request using JS origin fallback: enhanced location unavailable")
        } else if (!hasFreshLocationForTripSession()) {
          val now = System.currentTimeMillis()
          val ageSec = (now - lastEnhancedLocationUpdateAtMs) / 1000.0
          val accuracy = lastEnhancedLocationAccuracyM
          Log.i(
            TAG,
            "TO_START request using JS origin fallback: stale enhanced location " +
              "(ageSec=${"%.1f".format(Locale.US, ageSec)}, accuracyM=${accuracy?.let { "%.1f".format(Locale.US, it) } ?: "unknown"})"
          )
        } else {
          val liveOrigin = Point.fromLngLat(
            enhancedLocation.longitude,
            enhancedLocation.latitude
          )
          val originFromUserMeters = distanceMeters(liveOrigin, requestedOrigin)
          if (originFromUserMeters > TO_START_ORIGIN_MAX_DISTANCE_FROM_USER_M) {
            Log.i(
              TAG,
              "TO_START request using JS origin fallback: live fix is too far from requested user origin " +
                "(shift=${"%.1f".format(Locale.US, originFromUserMeters)}m)"
            )
          }
        }
      }
      val hasActiveToStartRoute = isExplicitToStartMode && primaryRoute != null && primaryRouteMode == "TO_START"
      val remaining = latestRouteDistanceRemainingM
      if (
        hasActiveToStartRoute &&
        remaining != null &&
        remaining <= TO_START_REROUTE_FREEZE_WITHIN_M
      ) {
        // Keep the current approach route stable near the start point.
        Log.i(
          TAG,
          "TO_START request skipped: freeze within ${TO_START_REROUTE_FREEZE_WITHIN_M.toInt()}m " +
            "(remaining=${"%.1f".format(Locale.US, remaining)}m)"
        )
        return
      }

      val now = System.currentTimeMillis()
      val lastOrigin = lastToStartRequestOrigin
      val lastDestination = lastToStartRequestDestination
      if (
        lastOrigin != null &&
        lastDestination != null &&
        now - lastToStartRequestAtMs < TO_START_REROUTE_MIN_INTERVAL_MS
      ) {
        val movedMeters = distanceMeters(currentOrigin, lastOrigin)
        val destinationShiftMeters = distanceMeters(currentDestination, lastDestination)
        if (
          movedMeters < TO_START_REROUTE_MIN_DISTANCE_M &&
          destinationShiftMeters < DESTINATION_CHANGE_THRESHOLD_M
        ) {
          Log.i(
            TAG,
            "TO_START request skipped: throttle window active " +
              "(moved=${"%.1f".format(Locale.US, movedMeters)}m, " +
              "destinationShift=${"%.1f".format(Locale.US, destinationShiftMeters)}m)"
          )
          return
        }
      }

      if (
        hasActiveToStartRoute &&
        latestRouteFractionTraveled > 0.01 &&
        lastOrigin != null &&
        now - lastToStartRequestAtMs < TO_START_REROUTE_MIN_INTERVAL_MS * 2
      ) {
        val movedMeters = distanceMeters(currentOrigin, lastOrigin)
        if (movedMeters < TO_START_REROUTE_MIN_DISTANCE_M * 1.5) {
          Log.i(
            TAG,
            "TO_START request skipped: progress-stability guard " +
              "(moved=${"%.1f".format(Locale.US, movedMeters)}m)"
          )
          return
        }
      }
    }

    val requestCoords = reduceForRouteRequest(requestedCoords)
    val routeSignature = buildRouteSignature(requestCoords)
    if (routeSignature == requestedRouteSignature) {
      if (isToStartMode) {
        Log.i(TAG, "TO_START request skipped: unchanged signature")
      }
      return
    }
    val routeOptionsBuilder = RouteOptions.builder()
      .applyDefaultNavigationOptions()
      .applyLanguageAndVoiceUnitOptions(reactContext)
      .coordinatesList(requestCoords)
      .steps(true)
      .bannerInstructions(true)
      .voiceInstructions(true)
      .language(routeLanguageTag)
      .voiceUnits("imperial")
    // Keep route identity stable. Automatic refresh can replace route IDs mid-session
    // and trigger route-line/progress mismatches.
    invokeIfPresent(routeOptionsBuilder, "enableRefresh", false)
    invokeIfPresent(routeOptionsBuilder, "setEnableRefresh", false)

    val hasIntermediatePoints = requestCoords.size > 2
    if (hasIntermediatePoints) {
      // Treat intermediates as silent shaping points to avoid gray "stop" dots on route.
      routeOptionsBuilder.waypointIndicesList(listOf(0, requestCoords.lastIndex))
    } else {
      destinationName?.let { endName ->
        val waypointNames = MutableList(requestCoords.size) { "" }
        waypointNames[waypointNames.lastIndex] = endName
        routeOptionsBuilder.waypointNamesList(waypointNames)
      }
    }

    val routeOptions = routeOptionsBuilder.build()
    val requestMode = activeMode
    val isOnRouteMode = requestMode == "ON_ROUTE"
    val isPreviewMode = requestMode == "PREVIEW"
    val requestId = ++routeRequestSequence
    activeRouteRequestId = requestId
    requestedRouteSignature = routeSignature
    routeRequestQueued = false
    routeRequestInFlight = true
    if (isToStartMode) {
      lastToStartRequestOrigin = requestedCoords.first()
      lastToStartRequestDestination = requestedCoords.last()
      lastToStartRequestAtMs = System.currentTimeMillis()
      Log.i(
        TAG,
        "TO_START request dispatched[id=$requestId]: coords=${requestCoords.size} " +
          "origin=${requestCoords.first().latitude()},${requestCoords.first().longitude()} " +
          "destination=${requestCoords.last().latitude()},${requestCoords.last().longitude()}"
      )
    }
    if (isOnRouteMode) {
      Log.i(
        TAG,
        "ON_ROUTE request dispatched[id=$requestId]: coords=${requestCoords.size} " +
          "origin=${requestCoords.first().latitude()},${requestCoords.first().longitude()} " +
          "destination=${requestCoords.last().latitude()},${requestCoords.last().longitude()}"
      )
    }
    if (isPreviewMode) {
      Log.i(
        TAG,
        "PREVIEW request dispatched[id=$requestId]: coords=${requestCoords.size} " +
          "origin=${requestCoords.first().latitude()},${requestCoords.first().longitude()} " +
          "destination=${requestCoords.last().latitude()},${requestCoords.last().longitude()}"
      )
    }

    nav.requestRoutes(
      routeOptions,
      object : NavigationRouterCallback {
        override fun onRoutesReady(routes: List<NavigationRoute>, routerOrigin: String) {
          if (requestId != activeRouteRequestId) {
            Log.i(
              TAG,
              "Ignoring stale route response[id=$requestId]: activeRequestId=$activeRouteRequestId routes=${routes.size}"
            )
            return
          }
          routeRequestInFlight = false
          val currentMode = navigationMode.orEmpty()
          if (requestMode != currentMode) {
            requestedRouteSignature = null
            Log.i(
              TAG,
              "Ignoring stale route response[id=$requestId]: modeAtRequest=$requestMode, currentMode=$currentMode, routes=${routes.size}"
            )
            flushQueuedRouteRequest()
            return
          }
          requestedRouteSignature = routeSignature
          if (isToStartMode) {
            Log.i(
              TAG,
              "TO_START routes ready: count=${routes.size}, routerOrigin=$routerOrigin, modeAtRequest=$requestMode"
            )
          }
          if (isOnRouteMode) {
            Log.i(
              TAG,
              "ON_ROUTE routes ready: count=${routes.size}, routerOrigin=$routerOrigin, modeAtRequest=$requestMode"
            )
          }
          if (isPreviewMode) {
            Log.i(
              TAG,
              "PREVIEW routes ready: count=${routes.size}, routerOrigin=$routerOrigin, modeAtRequest=$requestMode"
            )
          }
          if (!isViewStarted || !isStyleLoaded) {
            pendingRoutes = routes
            flushQueuedRouteRequest()
            return
          }
          queueRouteApply(routes, requestMode, requestId, "router")
          flushQueuedRouteRequest()
        }

        override fun onFailure(reasons: List<RouterFailure>, routeOptions: RouteOptions) {
          if (requestId != activeRouteRequestId) return
          routeRequestInFlight = false
          requestedRouteSignature = null
          if (isToStartMode) {
            val summary = reasons.joinToString(" | ") { it.toString() }
            Log.w(TAG, "TO_START request failed: $summary")
          }
          if (isOnRouteMode) {
            val summary = reasons.joinToString(" | ") { it.toString() }
            Log.w(TAG, "ON_ROUTE request failed: $summary")
          }
          if (isPreviewMode) {
            val summary = reasons.joinToString(" | ") { it.toString() }
            Log.w(TAG, "PREVIEW request failed: $summary")
          }
          flushQueuedRouteRequest()
        }

        override fun onCanceled(routeOptions: RouteOptions, routerOrigin: String) {
          if (requestId != activeRouteRequestId) return
          routeRequestInFlight = false
          requestedRouteSignature = null
          if (isToStartMode) {
            Log.w(TAG, "TO_START request canceled: routerOrigin=$routerOrigin")
          }
          if (isOnRouteMode) {
            Log.w(TAG, "ON_ROUTE request canceled: routerOrigin=$routerOrigin")
          }
          if (isPreviewMode) {
            Log.w(TAG, "PREVIEW request canceled: routerOrigin=$routerOrigin")
          }
          flushQueuedRouteRequest()
        }
      }
    )
  }

  private fun flushQueuedRouteRequest() {
    if (!routeRequestQueued) return
    routeRequestQueued = false
    scheduleRouteRequestEvaluation()
  }

  private fun applyRoutes(routes: List<NavigationRoute>, routeMode: String? = navigationMode) {
    queueRouteApply(routes, routeMode, activeRouteRequestId, "direct")
  }

  private fun queueRouteApply(
    routes: List<NavigationRoute>,
    routeMode: String? = navigationMode,
    requestId: Long = activeRouteRequestId,
    source: String = "unknown"
  ) {
    if (Looper.myLooper() != Looper.getMainLooper()) {
      runOnMainThread { queueRouteApply(routes, routeMode, requestId, source) }
      return
    }
    pendingRouteApplyRoutes = routes
    pendingRouteApplyMode = routeMode
    pendingRouteApplyRequestId = requestId
    pendingRouteApplySource = source

    if (routeApplyScheduled) return

    routeApplyScheduled = true
    val now = System.currentTimeMillis()
    val sinceLastApply = now - lastRouteApplyAtMs
    val delayMs = if (sinceLastApply < ROUTE_APPLY_DEBOUNCE_MS) ROUTE_APPLY_DEBOUNCE_MS else 60L
    postDelayed({
      routeApplyScheduled = false
      val routesToApply = pendingRouteApplyRoutes ?: return@postDelayed
      val modeToApply = pendingRouteApplyMode
      val requestIdToApply = pendingRouteApplyRequestId
      val applySource = pendingRouteApplySource
      pendingRouteApplyRoutes = null

      if (requestIdToApply > 0L && requestIdToApply != activeRouteRequestId) {
        Log.i(
          TAG,
          "applyRoutes skipped stale apply requestId=$requestIdToApply activeRequestId=$activeRouteRequestId source=$applySource"
        )
        return@postDelayed
      }

      val applySeq = ++routeApplySequence
      activeRouteApplySequence = applySeq
      applyRoutesNow(routesToApply, modeToApply, applySeq, requestIdToApply, applySource)
    }, delayMs)
  }

  private fun applyRoutesNow(
    routes: List<NavigationRoute>,
    routeMode: String? = navigationMode,
    applySeq: Long,
    requestId: Long,
    source: String
  ) {
    if (Looper.myLooper() != Looper.getMainLooper()) {
      runOnMainThread { applyRoutesNow(routes, routeMode, applySeq, requestId, source) }
      return
    }
    if (applySeq != activeRouteApplySequence) {
      Log.i(TAG, "applyRoutes[seq=$applySeq]: dropped stale apply sequence (active=$activeRouteApplySequence)")
      return
    }
    val nav = mapboxNavigation ?: return
    val currentMode = navigationMode
    if (
      !routeMode.isNullOrBlank() &&
      !currentMode.isNullOrBlank() &&
      routeMode != currentMode
    ) {
      Log.i(
        TAG,
        "applyRoutes[seq=$applySeq req=$requestId source=$source]: skipped mode drift (routeMode=$routeMode currentMode=$currentMode)"
      )
      return
    }
    try {
      val previousPrimaryRouteId = primaryRouteId
      primaryRoute = routes.firstOrNull()
      primaryRouteId = getNavigationRouteId(primaryRoute)
      if (previousPrimaryRouteId != primaryRouteId) {
        resetVoiceDedupCache()
      }
      primaryRouteMode = if (primaryRoute == null) null else routeMode

      val isEquivalentToLastApplied =
        !primaryRouteId.isNullOrBlank() &&
          primaryRouteId == lastAppliedNavigationRouteId &&
          routeMode == lastAppliedNavigationMode &&
          routes.size == lastAppliedNavigationRouteCount
      if (isEquivalentToLastApplied) {
        Log.i(
          TAG,
          "applyRoutes[seq=$applySeq req=$requestId source=$source]: skipped (same routeId=$primaryRouteId mode=${routeMode ?: "UNKNOWN"})"
        )
        if (routeLinePrimaryRouteId != primaryRouteId) {
          renderNavigationRoutes(routes)
        }
        renderNativeNavigationWidgetsFromRoute(primaryRoute)
        applyReroutePreferenceIfSupported(nav)
        applyMutedPreferenceIfSupported(nav)
        applyVoiceUiState()
        requestPreferredCameraForMode(force = false)
        return
      }

      val activeRouteId = primaryRouteId ?: "unknown"
      Log.i(
        TAG,
        "applyRoutes[seq=$applySeq req=$requestId source=$source]: count=${routes.size} routeId=$activeRouteId mode=${routeMode ?: "UNKNOWN"}"
      )

      // Order matters: set navigation routes first, then route line with the same route objects.
      nav.setNavigationRoutes(routes)
      currentActiveRouteId = primaryRouteId
      suppressRoutesObserverRenderUntilMs = System.currentTimeMillis() + 800L
      renderNavigationRoutes(routes)

      lastAppliedNavigationRouteId = primaryRouteId
      lastAppliedNavigationMode = routeMode
      lastAppliedNavigationRouteCount = routes.size
      lastRouteApplyAtMs = System.currentTimeMillis()
      logRootSize("applyRoutes")
      applyReroutePreferenceIfSupported(nav)
      applyMutedPreferenceIfSupported(nav)
      applyVoiceUiState()
      applyTripSessionMode()
      requestPreferredCameraForMode(force = true)
    } catch (_: Exception) {
      // Avoid native crash from invalid navigation state.
    }
  }

  private fun renderNavigationRoutes(routes: List<NavigationRoute>) {
    if (Looper.myLooper() != Looper.getMainLooper()) {
      runOnMainThread { renderNavigationRoutes(routes) }
      return
    }
    if (!isStyleLoaded) {
      pendingRoutes = routes
      return
    }

    if (navigationMode == "PREVIEW") {
      val previewPrimaryRoute = routes.firstOrNull()
      val previewRouteId = getNavigationRouteId(previewPrimaryRoute)
      routeLinePrimaryRouteId = previewRouteId
      currentActiveRouteId = previewRouteId
      val renderSeq = ++routeLineSetSequence
      val expectedRouteId = previewRouteId
      // In preview, still render the route line so users can see the full track.
      // Gray intermediate dots are prevented at request time via waypointIndices [0, last].
      routeLineApi.setNavigationRoutes(routes) { drawData ->
        if (renderSeq != routeLineSetSequence) {
          Log.i(TAG, "routeLine draw ignored: stale preview sequence=$renderSeq active=$routeLineSetSequence")
          return@setNavigationRoutes
        }
        if (
          !expectedRouteId.isNullOrBlank() &&
          !currentActiveRouteId.isNullOrBlank() &&
          expectedRouteId != currentActiveRouteId
        ) {
          Log.w(
            TAG,
            "routeLine draw ignored: preview routeId=$expectedRouteId activeRouteId=$currentActiveRouteId"
          )
          return@setNavigationRoutes
        }
        mapView.getMapboxMap().getStyle()?.let { style ->
          routeLineView.renderRouteDrawData(style, drawData)
          ensureLocationPuckAboveRouteLine(force = true)
        }
      }
      renderNativeNavigationWidgetsFromRoute(previewPrimaryRoute)
      updatePreviewTripSummary(previewPrimaryRoute)
      previewPrimaryRoute?.let { route ->
        try {
          viewportDataSource?.onRouteChanged(route)
          viewportDataSource?.evaluate()
        } catch (_: Exception) {
          // Keep compatibility across SDK minor versions.
        }
      }
      updateStoredRouteOverlay()
      hideUndesiredNativeWidgets()
      syncManeuverBannerVisibility("render-routes-preview")
      bringNativeOverlaysToFront()
      requestPreferredCameraForMode(force = true)
      return
    }

    val renderSeq = ++routeLineSetSequence
    val expectedRouteId = getNavigationRouteId(routes.firstOrNull())
    routeLinePrimaryRouteId = expectedRouteId
    currentActiveRouteId = expectedRouteId
    routeLineApi.setNavigationRoutes(routes) { drawData ->
      if (renderSeq != routeLineSetSequence) {
        Log.i(TAG, "routeLine draw ignored: stale active sequence=$renderSeq active=$routeLineSetSequence")
        return@setNavigationRoutes
      }
      if (
        !expectedRouteId.isNullOrBlank() &&
        !currentActiveRouteId.isNullOrBlank() &&
        expectedRouteId != currentActiveRouteId
      ) {
        Log.w(
          TAG,
          "routeLine draw ignored: routeId=$expectedRouteId activeRouteId=$currentActiveRouteId"
        )
        return@setNavigationRoutes
      }
      mapView.getMapboxMap().getStyle()?.let { style ->
        routeLineView.renderRouteDrawData(style, drawData)
        ensureLocationPuckAboveRouteLine(force = true)
      }
    }

    val primaryRoute = routes.firstOrNull()
    if (primaryRoute != null && navigationMode != "PREVIEW") {
      renderNativeNavigationWidgetsFromRoute(primaryRoute)
      try {
        viewportDataSource?.onRouteChanged(primaryRoute)
        viewportDataSource?.evaluate()
      } catch (_: Exception) {
        // Keep compatibility across SDK minor versions.
      }
      requestPreferredCameraForMode(force = true)
    }
    updatePreviewTripSummary(null)
    hideUndesiredNativeWidgets()
    syncManeuverBannerVisibility("render-routes-active")
    enforceActiveNavigationUi("render-routes-active")
    bringNativeOverlaysToFront()
  }

  private fun renderRouteProgress(progress: RouteProgress) {
    if (!isStyleLoaded) return

    val progressRoute = extractRouteFromProgress(progress)
    val progressRouteId = getNavigationRouteId(progressRoute)
    val routeLineRouteId = routeLinePrimaryRouteId
    val activeRouteId = currentActiveRouteId ?: primaryRouteId
    if (!progressRouteId.isNullOrBlank() && lastLoggedProgressRouteId != progressRouteId) {
      Log.i(
        TAG,
        "routeProgress: routeId=$progressRouteId activeRouteId=${activeRouteId ?: "none"}"
      )
      lastLoggedProgressRouteId = progressRouteId
    }
    if (
      !progressRouteId.isNullOrBlank() &&
      !activeRouteId.isNullOrBlank() &&
      progressRouteId != activeRouteId
    ) {
      Log.w(
        TAG,
        "routeProgress ignored: progressRouteId=$progressRouteId activeRouteId=$activeRouteId"
      )
      return
    }
    if (routeLineRouteId.isNullOrBlank() || progressRouteId.isNullOrBlank()) {
      return
    }
    if (routeLineRouteId != progressRouteId) {
      Log.w(
        TAG,
        "Route progress routeId mismatch. Skip route line update. primary=$routeLineRouteId progress=$progressRouteId"
      )
      return
    }

    val updateRouteId = progressRouteId
    routeLineApi.updateWithRouteProgress(progress) { update ->
      if (
        !updateRouteId.isNullOrBlank() &&
        !currentActiveRouteId.isNullOrBlank() &&
        updateRouteId != currentActiveRouteId
      ) {
        Log.w(
          TAG,
          "routeLine progress draw ignored: routeId=$updateRouteId activeRouteId=$currentActiveRouteId"
        )
        return@updateWithRouteProgress
      }
      mapView.getMapboxMap().getStyle()?.let { style ->
        routeLineView.renderRouteLineUpdate(style, update)
        ensureLocationPuckAboveRouteLine(force = true)
      }
    }

    val arrowUpdate = routeArrowApi.addUpcomingManeuverArrow(progress)
    mapView.getMapboxMap().getStyle()?.let { style ->
      routeArrowView.renderManeuverUpdate(style, arrowUpdate)
      ensureRouteArrowAboveRouteLine(style)
    }

    try {
      viewportDataSource?.onRouteProgressChanged(progress)
      viewportDataSource?.evaluate()
    } catch (_: Exception) {
      // Keep compatibility across SDK minor versions.
    }
    syncManeuverBannerVisibility("route-progress-update")
    bringNativeOverlaysToFront()
    requestFollowingCameraIfNeeded()
    enforceActiveNavigationUi("route-progress-update")
  }

  private fun initializeVoiceApis(accessToken: String) {
    if (speechApi == null) {
      speechApi = MapboxSpeechApi(reactContext, accessToken)
    }
    if (voiceInstructionsPlayer == null) {
      voiceInstructionsPlayer = MapboxVoiceInstructionsPlayer(reactContext, accessToken)
    }
  }

  private fun applyVoiceUiState() {
    if (isMuted) {
      audioGuidanceButton.mute()
      muteControlButton.setImageResource(android.R.drawable.ic_lock_silent_mode)
    } else {
      audioGuidanceButton.unmute()
      muteControlButton.setImageResource(android.R.drawable.ic_lock_silent_mode_off)
    }

    try {
      voiceInstructionsPlayer?.volume(SpeechVolume(if (isMuted) 0f else 1f))
    } catch (_: Exception) {
      // Ignore volume updates if voice player is not ready yet.
    }
  }

  private fun renderNativeNavigationWidgets(progress: RouteProgress) {
    if (Looper.myLooper() != Looper.getMainLooper()) {
      runOnMainThread { renderNativeNavigationWidgets(progress) }
      return
    }
    try {
      val previousManeuverCount = nativeManeuverCount
      val maneuversPayload = maneuverApi.getManeuvers(progress)
      var renderedCount = renderManeuversNativeCompat(maneuversPayload, "progress")
      if (renderedCount <= 0) {
        // Keep banner content available even when progress payload shape differs
        // across SDK patch versions.
        primaryRoute?.let { route ->
          val fallbackPayload = maneuverApi.getManeuvers(route)
          renderedCount = renderManeuversNativeCompat(fallbackPayload, "progress-fallback-route")
        }
      }
      nativeManeuverCount =
        if (renderedCount > 0) renderedCount else previousManeuverCount.coerceAtLeast(0)
      syncManeuverBannerVisibility("render-progress-maneuvers")
    } catch (e: Exception) {
      Log.w(TAG, "renderNativeNavigationWidgets: failed to render native widgets", e)
      primaryRoute?.let { renderNativeNavigationWidgetsFromRoute(it) }
    }
  }

  private fun updateStoredRouteOverlay() {
    if (!isStyleLoaded) return
    val style = mapView.getMapboxMap().getStyle() ?: return
    val storedCoords = dedupePoints(routeCoordinates)

    // Reset any previous stored overlay (safe if absent).
    try {
      style.removeStyleLayer(STORED_ROUTE_LAYER_ID)
    } catch (_: Exception) {
      // Layer may not exist yet.
    }
    try {
      style.removeStyleLayer(START_MARKER_LAYER_ID)
    } catch (_: Exception) {
      // Layer may not exist yet.
    }
    try {
      style.removeStyleLayer(STOP_MARKER_LAYER_ID)
    } catch (_: Exception) {
      // Layer may not exist yet.
    }
    try {
      style.removeStyleSource(STORED_ROUTE_SOURCE_ID)
    } catch (_: Exception) {
      // Source may not exist yet.
    }
    try {
      style.removeStyleSource(START_MARKER_SOURCE_ID)
    } catch (_: Exception) {
      // Source may not exist yet.
    }
    try {
      style.removeStyleSource(STOP_MARKER_SOURCE_ID)
    } catch (_: Exception) {
      // Source may not exist yet.
    }

    if (storedCoords.size < 2) {
      return
    }

    // Keep stored-geometry overlay for preview only.
    // During active navigation, rely on SDK route-line layers so the puck stays visually above route.
    if (navigationMode != "PREVIEW") {
      return
    }

    val storedFeatureCollection = FeatureCollection.fromFeature(
      Feature.fromGeometry(LineString.fromLngLats(storedCoords))
    )

    val sourceJson = storedFeatureCollection.toJson()
    val source = GeoJsonSource.Builder(STORED_ROUTE_SOURCE_ID)
      .data(sourceJson)
      .build()
    invokeIfPresent(style, "addSource", source)
    invokeIfPresent(style, "addStyleSource", STORED_ROUTE_SOURCE_ID, Value.valueOf(sourceJson))
    // Keep the source data up to date even if addSource is ignored by current SDK.
    try {
      style.setStyleSourceProperty(
        STORED_ROUTE_SOURCE_ID,
        "data",
        Value.valueOf(sourceJson)
      )
    } catch (e: Exception) {
      Log.w(TAG, "updateStoredRouteOverlay: failed to update source data", e)
      return
    }

    val storedRouteLayer = LineLayer(STORED_ROUTE_LAYER_ID, STORED_ROUTE_SOURCE_ID).apply {
      lineColor("#3D8DFF")
      lineWidth(9.0)
      lineOpacity(0.5)
      lineCap(LineCap.ROUND)
      lineJoin(LineJoin.ROUND)
    }

    try {
      invokeIfPresent(style, "addLayer", storedRouteLayer)
    } catch (e: Exception) {
      Log.w(TAG, "updateStoredRouteOverlay: failed to add stored route layer", e)
    }

    val startFeature = Feature.fromGeometry(storedCoords.first())
    val stopFeature = Feature.fromGeometry(storedCoords.last())
    val startSource = GeoJsonSource.Builder(START_MARKER_SOURCE_ID).data(startFeature.toJson()).build()
    val stopSource = GeoJsonSource.Builder(STOP_MARKER_SOURCE_ID).data(stopFeature.toJson()).build()
    invokeIfPresent(style, "addSource", startSource)
    invokeIfPresent(style, "addSource", stopSource)
    invokeIfPresent(style, "addStyleSource", START_MARKER_SOURCE_ID, Value.valueOf(startFeature.toJson()))
    invokeIfPresent(style, "addStyleSource", STOP_MARKER_SOURCE_ID, Value.valueOf(stopFeature.toJson()))

    val startLayer = CircleLayer(START_MARKER_LAYER_ID, START_MARKER_SOURCE_ID).apply {
      circleRadius(6.5)
      circleColor("#16C25C")
      circleStrokeColor("#FFFFFF")
      circleStrokeWidth(2.0)
    }
    val stopLayer = CircleLayer(STOP_MARKER_LAYER_ID, STOP_MARKER_SOURCE_ID).apply {
      circleRadius(6.5)
      circleColor("#E53935")
      circleStrokeColor("#FFFFFF")
      circleStrokeWidth(2.0)
    }
    invokeIfPresent(style, "addLayer", startLayer)
    invokeIfPresent(style, "addLayer", stopLayer)
  }

  private fun renderNativeNavigationWidgetsFromRoute(route: NavigationRoute?) {
    if (Looper.myLooper() != Looper.getMainLooper()) {
      runOnMainThread { renderNativeNavigationWidgetsFromRoute(route) }
      return
    }
    if (route == null) {
      if (navigationMode == "PREVIEW") {
        nativeManeuverCount = 0
      }
      ensureBottomBannerVisible(route)
      syncManeuverBannerVisibility("render-route-maneuvers-empty")
      return
    }
    try {
      val maneuversPayload = maneuverApi.getManeuvers(route)
      val renderedCount = renderManeuversNativeCompat(maneuversPayload, "route")
      if (renderedCount > 0) {
        nativeManeuverCount = renderedCount
      } else if (navigationMode == "PREVIEW") {
        nativeManeuverCount = 0
      }
      ensureBottomBannerVisible(route)
      syncManeuverBannerVisibility("render-route-maneuvers")
    } catch (e: Exception) {
      if (navigationMode == "PREVIEW") {
        nativeManeuverCount = 0
      }
      Log.w(TAG, "renderNativeNavigationWidgetsFromRoute: failed to initialize maneuver banner", e)
      ensureBottomBannerVisible(route)
      syncManeuverBannerVisibility("render-route-maneuvers-failed")
    }
  }

  private fun renderManeuversNativeCompat(payload: Any?, source: String): Int {
    if (payload == null) return 0

    castManeuverExpected(payload)?.let { expectedManeuvers ->
      val expectedCount = extractCollectionSize(expectedManeuvers)
      return if (renderManeuverExpectedDirect(expectedManeuvers, source)) {
        expectedCount.coerceAtLeast(0)
      } else {
        0
      }
    }

    val candidates = buildManeuverPayloadCandidates(payload)
    var rendered = false
    var bestCount = 0

    for (candidate in candidates) {
      val candidateCount = extractCollectionSize(candidate)
      // Avoid wiping currently-visible banner content with empty candidate payloads.
      if (candidateCount <= 0 && candidate !== payload) continue
      if (renderManeuverCandidate(candidate, source)) {
        rendered = true
        if (candidateCount > bestCount) bestCount = candidateCount
        if (bestCount > 0) break
      }
    }

    if (!rendered) {
      Log.w(TAG, "renderManeuversNativeCompat($source): no compatible render method for ${payload::class.java.name}")
    }
    return bestCount.coerceAtLeast(0)
  }

  @Suppress("UNCHECKED_CAST")
  private fun castManeuverExpected(payload: Any?): Expected<ManeuverError, List<Maneuver>>? {
    return payload as? Expected<ManeuverError, List<Maneuver>>
  }

  private fun renderManeuverExpectedDirect(
    maneuvers: Expected<ManeuverError, List<Maneuver>>,
    source: String
  ): Boolean {
    return try {
      maneuverView.renderManeuvers(maneuvers)
      ensureManeuverBannerLayout()
      maneuverView.requestLayout()
      maneuverView.post {
        maneuverView.invalidate()
        bringNativeOverlaysToFront()
      }
      true
    } catch (e: Exception) {
      Log.w(TAG, "renderManeuverExpectedDirect($source): failed", e)
      false
    }
  }

  private fun buildManeuverPayloadCandidates(payload: Any): List<Any> {
    val candidates = ArrayList<Any>(6)
    fun addCandidate(value: Any?) {
      if (value == null) return
      if (candidates.none { it === value }) {
        candidates.add(value)
      }
    }

    addCandidate(payload)
    val expectedValue = extractExpectedValue(payload)
    addCandidate(expectedValue)
    addCandidate(readProperty(payload, "maneuvers"))
    addCandidate(readProperty(payload, "navigationManeuvers"))
    addCandidate(readProperty(payload, "routeManeuvers"))
    expectedValue?.let { nested ->
      addCandidate(readProperty(nested, "maneuvers"))
      addCandidate(readProperty(nested, "navigationManeuvers"))
    }
    return candidates
  }

  private fun extractCollectionSize(candidate: Any?): Int {
    if (candidate == null) return 0
    return when (candidate) {
      is Collection<*> -> candidate.size
      is Iterable<*> -> candidate.count()
      else -> extractManeuverList(candidate)?.size ?: 0
    }
  }

  private fun renderManeuverCandidate(candidate: Any, source: String): Boolean {
    castManeuverExpected(candidate)?.let { expectedManeuvers ->
      return renderManeuverExpectedDirect(expectedManeuvers, source)
    }
    if (candidate is Collection<*>) {
      val typed = candidate.filterIsInstance<Maneuver>()
      if (typed.isNotEmpty() && renderManeuverListTyped(typed, source)) {
        return true
      }
      val filtered = candidate.filterNotNull()
      if (filtered.isNotEmpty() && renderManeuverListDirect(filtered, source)) {
        return true
      }
    }
    return try {
      if (!invokeRenderManeuversReflective(candidate)) return false
      ensureManeuverBannerLayout()
      maneuverView.requestLayout()
      maneuverView.post { bringNativeOverlaysToFront() }
      true
    } catch (e: Exception) {
      Log.w(TAG, "renderManeuverCandidate($source): reflective render failed", e)
      false
    }
  }

  private fun renderManeuverListTyped(maneuvers: List<Maneuver>, source: String): Boolean {
    if (maneuvers.isEmpty()) return false
    return try {
      if (!invokeRenderManeuversReflective(maneuvers)) return false
      ensureManeuverBannerLayout()
      maneuverView.requestLayout()
      maneuverView.post { bringNativeOverlaysToFront() }
      true
    } catch (e: Exception) {
      Log.w(TAG, "renderManeuverListTyped($source): failed", e)
      false
    }
  }

  private fun renderManeuverListDirect(maneuvers: List<Any>, source: String): Boolean {
    if (maneuvers.isEmpty()) return false
    return try {
      if (!invokeRenderManeuversReflective(maneuvers)) return false
      ensureManeuverBannerLayout()
      maneuverView.requestLayout()
      maneuverView.post { bringNativeOverlaysToFront() }
      true
    } catch (e: Exception) {
      Log.w(TAG, "renderManeuverListDirect($source): failed", e)
      false
    }
  }

  private fun invokeRenderManeuversReflective(payload: Any): Boolean {
    val payloadClass = payload.javaClass
    val candidates = sequenceOf(
      maneuverView.javaClass.methods.asSequence(),
      maneuverView.javaClass.declaredMethods.asSequence(),
    ).flatten().filter {
      if (it.name != "renderManeuvers" || it.parameterTypes.size != 1) return@filter false
      val param = it.parameterTypes[0]
      param.isAssignableFrom(payloadClass) ||
        param.isAssignableFrom(List::class.java) ||
        param.isAssignableFrom(Collection::class.java) ||
        param.isAssignableFrom(Iterable::class.java)
    }.toList()

    val method = candidates.firstOrNull { it.parameterTypes[0].isAssignableFrom(payloadClass) }
      ?: candidates.firstOrNull()
      ?: return false

    return try {
      method.isAccessible = true
      method.invoke(maneuverView, payload)
      true
    } catch (_: Exception) {
      false
    }
  }

  private fun extractManeuverList(payload: Any?): List<Any>? {
    var current = payload
    repeat(3) {
      when (current) {
        null -> return null
        is Collection<*> -> return current.filterNotNull()
        is Iterable<*> -> return current.filterNotNull()
      }

      val value = extractExpectedValue(current) ?: return null
      if (value === current) return null
      current = value
    }
    return null
  }

  private fun extractExpectedValue(target: Any?): Any? {
    if (target == null) return null
    val isValue = readProperty(target, "isValue") as? Boolean
    if (isValue == false) return null
    return readProperty(target, "value") ?: readProperty(target, "getValue")
  }

  private fun playVoiceInstruction(voiceInstructions: VoiceInstructions) {
    if (isMuted) return

    val currentSpeechApi = speechApi ?: return
    val currentVoicePlayer = voiceInstructionsPlayer ?: return
    val dedupeKey = buildVoiceDedupeKey(voiceInstructions)
    if (!shouldPlayVoiceInstruction(dedupeKey)) return
    val requestSequence = ++voiceInstructionSequence

    try {
      currentSpeechApi.cancel()
    } catch (_: Exception) {
      // Ignore cancellation issues.
    }
    try {
      currentVoicePlayer.clear()
    } catch (_: Exception) {
      // Ignore queue clear issues.
    }

    currentSpeechApi.generate(voiceInstructions) { expected ->
      if (requestSequence != voiceInstructionSequence) return@generate
      val announcement: SpeechAnnouncement =
        expected.value?.announcement ?: expected.error?.fallback ?: return@generate

      currentVoicePlayer.play(announcement) { played ->
        if (requestSequence != voiceInstructionSequence) return@play
        try {
          currentSpeechApi.clean(played)
        } catch (e: Exception) {
          Log.w(TAG, "playVoiceInstruction: failed to clean temporary voice announcement", e)
        }
      }
    }
  }

  private fun buildVoiceDedupeKey(voiceInstructions: VoiceInstructions): String {
    val mode = navigationMode ?: "UNKNOWN"
    val routeId = primaryRouteId ?: "no-route"
    val rawText = voiceInstructions.announcement() ?: voiceInstructions.ssmlAnnouncement()
    val normalizedText = sanitizeForUi(rawText)?.lowercase(Locale.US) ?: ""
    val roundedDistanceBucket = voiceInstructions.distanceAlongGeometry()?.toDouble()?.let {
      (it / 25.0).roundToInt()
    } ?: -1
    return "$mode|$routeId|$roundedDistanceBucket|$normalizedText"
  }

  private fun shouldPlayVoiceInstruction(key: String): Boolean {
    val now = System.currentTimeMillis()
    purgeOldVoiceDedupEntries(now)
    val lastPlayedAt = recentVoiceInstructionKeys[key]
    if (lastPlayedAt != null && now - lastPlayedAt < VOICE_DEDUPE_COOLDOWN_MS) {
      return false
    }
    recentVoiceInstructionKeys[key] = now
    trimVoiceDedupCache()
    return true
  }

  private fun purgeOldVoiceDedupEntries(nowMs: Long) {
    val iterator = recentVoiceInstructionKeys.entries.iterator()
    while (iterator.hasNext()) {
      val entry = iterator.next()
      if (nowMs - entry.value > VOICE_DEDUPE_COOLDOWN_MS * 3) {
        iterator.remove()
      }
    }
  }

  private fun trimVoiceDedupCache() {
    while (recentVoiceInstructionKeys.size > VOICE_DEDUPE_MAX_ENTRIES) {
      val firstKey = recentVoiceInstructionKeys.entries.firstOrNull()?.key ?: break
      recentVoiceInstructionKeys.remove(firstKey)
    }
  }

  private fun resetVoiceDedupCache() {
    recentVoiceInstructionKeys.clear()
  }

  private fun applyViewportPadding() {
    val viewHeightPx = when {
      currentRootHeight() > 0 -> currentRootHeight().toDouble()
      mapView.height > 0 -> mapView.height.toDouble()
      height > 0 -> height.toDouble()
      else -> resources.displayMetrics.heightPixels.toDouble()
    }
    // Keep puck near the lower quarter (~70-75% from top), matching turn-by-turn UX.
    val dynamicFollowingBottom = maxOf(dpToPx(FOLLOWING_BOTTOM_PADDING_DP), viewHeightPx * 0.08)
    val preferredFollowingTop = maxOf(dpToPx(FOLLOWING_TOP_PADDING_DP), viewHeightPx * 0.62)
    // Guard against invalid effective viewport (observed as massive top padding).
    val maxFollowingTop = maxOf(dpToPx(140.0), viewHeightPx - dynamicFollowingBottom - dpToPx(180.0))
    val dynamicFollowingTop = preferredFollowingTop.coerceAtMost(maxFollowingTop)
    val followingPadding = EdgeInsets(
      dynamicFollowingTop,
      dpToPx(FOLLOWING_SIDE_PADDING_DP),
      dynamicFollowingBottom,
      dpToPx(FOLLOWING_SIDE_PADDING_DP)
    )
    val overviewPadding = EdgeInsets(
      dpToPx(OVERVIEW_TOP_PADDING_DP),
      dpToPx(OVERVIEW_SIDE_PADDING_DP),
      dpToPx(OVERVIEW_BOTTOM_PADDING_DP),
      dpToPx(OVERVIEW_SIDE_PADDING_DP)
    )
    followingCameraPadding = followingPadding
    overviewCameraPadding = overviewPadding

    viewportDataSource?.followingPadding = followingPadding
    viewportDataSource?.overviewPadding = overviewPadding
    applyNorthUpViewportOverride()
    viewportDataSource?.evaluate()
    applyCameraPaddingForMode()
  }

  private fun applyCameraPaddingForMode() {
    val padding =
      if (navigationMode == "PREVIEW") overviewCameraPadding else followingCameraPadding
    if (padding == null) return
    try {
      mapView.getMapboxMap().setCamera(
        CameraOptions.Builder().padding(padding).build()
      )
    } catch (_: Exception) {
      // Safe fallback for SDK variants where camera padding is internally controlled.
    }
  }

  private fun bindOptionalCameraButtons() {
    val camera = navigationCamera ?: return
    recenterButton?.let { invokeIfPresent(it, "setNavigationCamera", camera) }
    overviewButton?.let { invokeIfPresent(it, "setNavigationCamera", camera) }
  }

  private fun createFloatingControlButton(iconRes: Int): ImageButton {
    val sizePx = dpToPxInt(CAMERA_CONTROL_SIZE_DP.toDouble())
    val button = ImageButton(reactContext)
    button.layoutParams = LinearLayout.LayoutParams(sizePx, sizePx)
    button.scaleType = ImageView.ScaleType.CENTER_INSIDE
    button.setPadding(
      dpToPxInt(12.0),
      dpToPxInt(12.0),
      dpToPxInt(12.0),
      dpToPxInt(12.0)
    )
    button.setImageResource(iconRes)
    button.imageTintList = ColorStateList.valueOf(Color.WHITE)
    button.background = GradientDrawable().apply {
      shape = GradientDrawable.OVAL
      setColor(Color.parseColor("#CC0F172A"))
      setStroke(dpToPxInt(1.0), Color.parseColor("#66FFFFFF"))
    }
    button.elevation = dpToPx(4.0).toFloat()
    return button
  }

  private fun createSpeedometerView(): TextView {
    return TextView(reactContext).apply {
      text = "--\nMPH"
      gravity = Gravity.CENTER
      setTextColor(Color.WHITE)
      textSize = 16f
      setLineSpacing(0f, 0.95f)
      background = GradientDrawable().apply {
        shape = GradientDrawable.OVAL
        setColor(Color.parseColor("#E60B1220"))
        setStroke(dpToPxInt(2.0), Color.parseColor("#66FFFFFF"))
      }
      elevation = dpToPx(5.0).toFloat()
    }
  }

  private fun createRoadAlertView(): TextView {
    return TextView(reactContext).apply {
      visibility = View.GONE
      minWidth = dpToPxInt(ROAD_ALERT_MIN_WIDTH_DP.toDouble())
      gravity = Gravity.CENTER_VERTICAL
      setTextColor(Color.WHITE)
      textSize = 13f
      setPadding(
        dpToPxInt(12.0),
        dpToPxInt(8.0),
        dpToPxInt(12.0),
        dpToPxInt(8.0)
      )
      background = GradientDrawable().apply {
        cornerRadius = dpToPx(12.0).toFloat()
        setColor(Color.parseColor("#D90F172A"))
        setStroke(dpToPxInt(1.0), Color.parseColor("#66FFFFFF"))
      }
      elevation = dpToPx(5.0).toFloat()
    }
  }

  private fun createWayNameView(): TextView {
    return TextView(reactContext).apply {
      visibility = View.GONE
      minWidth = dpToPxInt(WAY_NAME_MIN_WIDTH_DP.toDouble())
      gravity = Gravity.CENTER_VERTICAL
      setTextColor(Color.WHITE)
      textSize = 13f
      setPadding(
        dpToPxInt(12.0),
        dpToPxInt(8.0),
        dpToPxInt(12.0),
        dpToPxInt(8.0)
      )
      background = GradientDrawable().apply {
        cornerRadius = dpToPx(12.0).toFloat()
        setColor(Color.parseColor("#D90B1220"))
        setStroke(dpToPxInt(1.0), Color.parseColor("#66FFFFFF"))
      }
      elevation = dpToPx(5.0).toFloat()
    }
  }

  private fun createPreviewTripSummaryView(): TextView {
    return TextView(reactContext).apply {
      visibility = View.GONE
      gravity = Gravity.CENTER
      setTextColor(Color.WHITE)
      textSize = 20f
      setPadding(
        dpToPxInt(22.0),
        dpToPxInt(12.0),
        dpToPxInt(22.0),
        dpToPxInt(12.0)
      )
      background = GradientDrawable().apply {
        cornerRadius = dpToPx(24.0).toFloat()
        setColor(Color.parseColor("#DE0B1220"))
        setStroke(dpToPxInt(1.0), Color.parseColor("#66FFFFFF"))
      }
      elevation = dpToPx(12.0).toFloat()
      translationZ = dpToPx(12.0).toFloat()
      includeFontPadding = false
      text = "-- min • -- mi"
    }
  }

  private fun createFallbackManeuverBannerView(): TextView {
    return TextView(reactContext).apply {
      visibility = View.GONE
      gravity = Gravity.CENTER_VERTICAL
      setTextColor(Color.WHITE)
      textSize = 17f
      setPadding(
        dpToPxInt(18.0),
        dpToPxInt(14.0),
        dpToPxInt(18.0),
        dpToPxInt(14.0)
      )
      background = GradientDrawable().apply {
        cornerRadius = dpToPx(18.0).toFloat()
        setColor(Color.parseColor("#E10F172A"))
        setStroke(dpToPxInt(1.0), Color.parseColor("#66FFFFFF"))
      }
      elevation = dpToPx(12.0).toFloat()
      translationZ = dpToPx(12.0).toFloat()
      includeFontPadding = false
      maxLines = 2
      text = ""
    }
  }

  private fun updateTripProgress(progress: RouteProgress) {
    if (Looper.myLooper() != Looper.getMainLooper()) {
      runOnMainThread { updateTripProgress(progress) }
      return
    }
    if (navigationMode == "PREVIEW") {
      tripProgressView.visibility = View.GONE
      updatePreviewTripSummary(primaryRoute)
      return
    }
    previewTripSummaryView.visibility = View.GONE
    try {
      val tripProgress = tripProgressApi.getTripProgress(progress)
      tripProgressView.render(tripProgress)
      tripProgressView.visibility = View.VISIBLE
      previewTripSummaryView.visibility = View.GONE
      ensureBottomBannerLayout()
      refreshNativeOverlayLayout("trip-progress")
    } catch (e: Exception) {
      Log.w(TAG, "updateTripProgress: failed to render native trip progress", e)
      tripProgressView.visibility = View.GONE
      ensureBottomBannerVisible(primaryRoute)
      refreshNativeOverlayLayout("trip-progress-fallback")
    }
  }

  private fun updatePreviewTripSummary(route: NavigationRoute?) {
    if (navigationMode != "PREVIEW") {
      previewTripSummaryView.visibility = View.GONE
      return
    }

    val summaryText = buildRouteSummaryText(route ?: primaryRoute)
    if (summaryText == null) {
      previewTripSummaryView.visibility = View.GONE
      return
    }
    previewTripSummaryView.text = summaryText
    previewTripSummaryView.visibility = View.VISIBLE
  }

  private fun ensureBottomBannerVisible(route: NavigationRoute?) {
    val mode = navigationMode
    if (mode == "PREVIEW") {
      tripProgressView.visibility = View.GONE
      updatePreviewTripSummary(route)
      return
    }
    if (mode != "TO_START" && mode != "ON_ROUTE") {
      previewTripSummaryView.visibility = View.GONE
      return
    }
    val tripHasRenderableLayout =
      tripProgressView.visibility == View.VISIBLE &&
        isActuallyVisibleOnScreen(tripProgressView)
    if (tripHasRenderableLayout) {
      previewTripSummaryView.visibility = View.GONE
      return
    }
    val summaryText = buildRouteSummaryText(route ?: primaryRoute)
    if (summaryText == null) {
      previewTripSummaryView.visibility = View.GONE
      return
    }
    previewTripSummaryView.text = summaryText
    previewTripSummaryView.visibility = View.VISIBLE
    ensureBottomBannerLayout()
  }

  private fun buildRouteSummaryText(route: NavigationRoute?): String? {
    val resolvedRoute = route ?: primaryRoute
    if (resolvedRoute == null) return null

    val directionsRoute = readProperty(resolvedRoute, "directionsRoute")
    val durationSeconds = readNumberProperty(directionsRoute, "duration")
      ?: readNumberProperty(resolvedRoute, "duration")
    val distanceMeters = readNumberProperty(directionsRoute, "distance")
      ?: readNumberProperty(resolvedRoute, "distance")

    if (
      durationSeconds == null ||
      distanceMeters == null ||
      !durationSeconds.isFinite() ||
      !distanceMeters.isFinite() ||
      durationSeconds <= 0.0 ||
      distanceMeters <= 0.0
    ) {
      return null
    }

    val minutesRemaining = kotlin.math.max(1, (durationSeconds / 60.0).roundToInt())
    val milesRemaining = distanceMeters / 1609.344
    return String.format(
      Locale.US,
      "%d min • %.1f mi",
      minutesRemaining,
      milesRemaining
    )
  }

  private fun updateRoadAlertFromProgress(progress: RouteProgress) {
    if (navigationMode == "PREVIEW") {
      roadAlertView.visibility = View.GONE
      lastRoadAlertText = null
      return
    }
    val message = deriveRoadAlertFromRoadObjects(progress)
    if (message.isNullOrBlank()) {
      roadAlertView.visibility = View.GONE
      lastRoadAlertText = null
      return
    }
    if (lastRoadAlertText == message) return
    lastRoadAlertText = message
    roadAlertView.text = message
    roadAlertView.visibility = View.VISIBLE
  }

  private fun updateWayNameFromProgress(progress: RouteProgress) {
    if (navigationMode == "PREVIEW") {
      wayNameView.visibility = View.GONE
      lastWayNameText = null
      return
    }
    val name = sanitizeForUi(progress.currentLegProgress?.currentStepProgress?.step?.name())
    if (name.isNullOrBlank()) {
      wayNameView.visibility = View.GONE
      lastWayNameText = null
      return
    }
    val label = "On $name"
    if (lastWayNameText == label && wayNameView.visibility == View.VISIBLE) return
    lastWayNameText = label
    wayNameView.text = label
    wayNameView.visibility = View.VISIBLE
  }

  private fun updateManeuverAwareZoom(progress: RouteProgress) {
    if (navigationMode == "PREVIEW") {
      clearFollowingZoomOverride()
      return
    }

    val stepProgress = progress.currentLegProgress?.currentStepProgress
    val maneuver = stepProgress?.step?.maneuver()
    val maneuverType = maneuver?.type()?.lowercase(Locale.US).orEmpty()
    val maneuverModifier = maneuver?.modifier()?.lowercase(Locale.US).orEmpty()
    val distanceToManeuverM = stepProgress?.distanceRemaining?.toDouble()
    val speedMps = extractSpeedMps(latestEnhancedLocation)?.coerceAtLeast(0.0) ?: 0.0
    val straightZoom = computeStraightCruiseZoom(speedMps)

    val isTurnLikeManeuver =
      maneuverType.contains("turn") ||
        maneuverType.contains("roundabout") ||
        maneuverType.contains("rotary") ||
        maneuverType.contains("fork") ||
        maneuverType.contains("merge") ||
        maneuverType.contains("exit") ||
        maneuverType.contains("off_ramp") ||
        maneuverType.contains("uturn") ||
        // Fallback for SDK payloads where type is omitted but modifier carries direction.
        (maneuverType.isBlank() &&
          (maneuverModifier.contains("left") ||
            maneuverModifier.contains("right") ||
            maneuverModifier.contains("uturn")))

    val targetZoomRaw = when {
      !isTurnLikeManeuver || distanceToManeuverM == null || !distanceToManeuverM.isFinite() -> {
        straightZoom
      }
      distanceToManeuverM > TURN_ZOOM_PREP_THRESHOLD_M -> {
        straightZoom
      }
      distanceToManeuverM <= TURN_ZOOM_NEAR_THRESHOLD_M -> {
        TURN_ZOOM_NEAR
      }
      distanceToManeuverM <= TURN_ZOOM_FAR_THRESHOLD_M -> {
        val t =
          ((distanceToManeuverM - TURN_ZOOM_NEAR_THRESHOLD_M) /
            (TURN_ZOOM_FAR_THRESHOLD_M - TURN_ZOOM_NEAR_THRESHOLD_M)).coerceIn(0.0, 1.0)
        lerp(TURN_ZOOM_NEAR, TURN_ZOOM_FAR, t)
      }
      else -> {
        val t =
          ((distanceToManeuverM - TURN_ZOOM_FAR_THRESHOLD_M) /
            (TURN_ZOOM_PREP_THRESHOLD_M - TURN_ZOOM_FAR_THRESHOLD_M)).coerceIn(0.0, 1.0)
        lerp(TURN_ZOOM_FAR, straightZoom, t)
      }
    }
    val targetZoom = targetZoomRaw.coerceIn(FOLLOWING_ZOOM_MIN, FOLLOWING_ZOOM_MAX)
    applyFollowingZoomOverride(targetZoom)
  }

  private fun computeStraightCruiseZoom(speedMps: Double): Double {
    val normalized = (speedMps / STRAIGHT_ZOOM_FAST_SPEED_MPS).coerceIn(0.0, 1.0)
    return lerp(STRAIGHT_ZOOM_SLOW, STRAIGHT_ZOOM_FAST, normalized)
  }

  private fun lerp(from: Double, to: Double, t: Double): Double {
    val clamped = t.coerceIn(0.0, 1.0)
    return from + (to - from) * clamped
  }

  private fun applyFollowingZoomOverride(targetZoom: Double) {
    val current = activeFollowingZoomOverride
    val smoothedTarget =
      if (current == null) targetZoom else lerp(current, targetZoom, FOLLOWING_ZOOM_SMOOTHING)
    if (current != null && abs(current - smoothedTarget) <= TURN_ZOOM_EPSILON) return
    activeFollowingZoomOverride = smoothedTarget

    // SDK signatures vary by minor version; try both numeric types.
    invokeIfPresent(viewportDataSource, "followingZoomPropertyOverride", smoothedTarget)
    invokeIfPresent(viewportDataSource, "followingZoomPropertyOverride", smoothedTarget.toFloat())
    try {
      viewportDataSource?.evaluate()
    } catch (_: Exception) {
      // Ignore optional API mismatch across SDK patch versions.
    }
  }

  private fun clearFollowingZoomOverride() {
    if (activeFollowingZoomOverride == null) return
    activeFollowingZoomOverride = null
    invokeIfPresent(viewportDataSource, "clearFollowingZoomPropertyOverride")
    try {
      viewportDataSource?.evaluate()
    } catch (_: Exception) {
      // Ignore optional API mismatch across SDK patch versions.
    }
  }

  private fun formatAlertDistance(distanceMeters: Double?): String {
    if (distanceMeters == null || distanceMeters <= 0.0) return ""
    return if (distanceMeters < 160.0) {
      "${(distanceMeters * 3.28084).roundToInt()} ft •"
    } else {
      String.format(Locale.US, "%.1f mi •", distanceMeters / 1609.344)
    }
  }

  private fun updateSpeedometer(location: Location?) {
    val speedMps = extractSpeedMps(location)
    val mph = speedMps?.times(2.236936)?.coerceAtLeast(0.0)
    val text = if (mph == null || mph.isNaN()) {
      "--\nMPH"
    } else {
      "${mph.roundToInt()}\nMPH"
    }
    speedometerView.post {
      speedometerView.text = text
    }
  }

  private fun updateSpeedInfo(locationMatcherResult: LocationMatcherResult) {
    val speedInfoView = speedInfoView ?: return
    if (navigationMode == "PREVIEW") {
      speedInfoView.visibility = View.GONE
      return
    }

    val speedLimit = readProperty(locationMatcherResult, "speedLimit")
      ?: readProperty(locationMatcherResult, "getSpeedLimit")
    if (speedLimit == null) {
      speedInfoView.visibility = View.GONE
      return
    }

    val api = speedInfoApi ?: return
    val speedInfoValue = invokeSpeedInfoApi(api, locationMatcherResult, speedLimit)
    if (speedInfoValue == null) {
      speedInfoView.visibility = View.GONE
      return
    }
    val renderMethod = speedInfoView::class.java.methods.firstOrNull {
      it.name == "render" &&
        it.parameterTypes.size == 1 &&
        isArgumentCompatible(it.parameterTypes[0], speedInfoValue)
    }
    if (renderMethod == null) {
      speedInfoView.visibility = View.GONE
      return
    }
    try {
      renderMethod.invoke(speedInfoView, speedInfoValue)
      speedInfoView.visibility = View.VISIBLE
    } catch (_: Exception) {
      speedInfoView.visibility = View.GONE
    }
  }

  private fun invokeSpeedInfoApi(
    api: Any,
    locationMatcherResult: LocationMatcherResult,
    speedLimit: Any
  ): Any? {
    val candidates = api::class.java.methods.filter { it.name == "updatePostedAndCurrentSpeed" }
    for (method in candidates) {
      val params = method.parameterTypes
      try {
        when {
          params.size == 2 &&
            isArgumentCompatible(params[0], speedLimit) &&
            isArgumentCompatible(params[1], distanceFormatterOptions) -> {
            return method.invoke(api, speedLimit, distanceFormatterOptions)
          }
          params.size == 2 &&
            isArgumentCompatible(params[0], locationMatcherResult) &&
            isArgumentCompatible(params[1], distanceFormatterOptions) -> {
            return method.invoke(api, locationMatcherResult, distanceFormatterOptions)
          }
        }
      } catch (_: Exception) {
        // Try another compatible method signature.
      }
    }
    return null
  }

  private fun deriveRoadAlertFromRoadObjects(progress: RouteProgress): String? {
    val roadObjectsRaw = readProperty(progress, "upcomingRoadObjects")
      ?: readProperty(progress, "getUpcomingRoadObjects")
      ?: return null
    val roadObjects = (roadObjectsRaw as? Iterable<*>)?.toList().orEmpty()
    if (roadObjects.isEmpty()) return null

    var bestLabel: String? = null
    var bestDistance: Double? = null
    var bestKind: String? = null

    roadObjects.forEach { roadObject ->
      if (roadObject == null) return@forEach
      val kindRaw = readProperty(roadObject, "kind")
        ?: readProperty(roadObject, "type")
        ?: readProperty(roadObject, "objectType")
        ?: readProperty(roadObject, "roadObjectType")
      val kind = kindRaw?.toString()?.uppercase(Locale.US) ?: return@forEach

      val label = when {
        kind.contains("TRAFFIC_SIGNAL") || kind.contains("TRAFFIC_LIGHT") -> "Traffic lights ahead"
        kind.contains("CROSSING") || kind.contains("PEDESTRIAN") -> "Crossing ahead"
        kind.contains("RAILWAY") -> "Rail crossing ahead"
        kind.contains("SPEED_CAMERA") || kind.contains("CAMERA") -> "Road camera ahead"
        kind.contains("STOP_SIGN") -> "Stop sign ahead"
        kind.contains("YIELD_SIGN") -> "Give way ahead"
        kind.contains("ROUNDABOUT") -> "Roundabout ahead"
        else -> null
      } ?: return@forEach

      val distance = readNumberProperty(roadObject, "distanceToStart")
        ?: readNumberProperty(roadObject, "distanceToObjectStart")
        ?: readNumberProperty(roadObject, "distance")
        ?: readNumberProperty(roadObject, "distanceFromStart")

      val shouldReplace = when {
        bestLabel == null -> true
        distance == null -> false
        bestDistance == null -> true
        else -> distance < bestDistance
      }

      if (shouldReplace) {
        bestDistance = distance
        bestLabel = label
        bestKind = kind
      }
    }

    val label = bestLabel ?: return null
    val prefix = formatAlertDistance(bestDistance)
    val needsSlowDown =
      bestDistance != null &&
      bestDistance <= ROAD_ALERT_SLOW_DOWN_THRESHOLD_M &&
      (
        bestKind?.contains("TRAFFIC_SIGNAL") == true ||
          bestKind?.contains("TRAFFIC_LIGHT") == true ||
          bestKind?.contains("CROSSING") == true ||
          bestKind?.contains("PEDESTRIAN") == true ||
          bestKind?.contains("ROUNDABOUT") == true
        )
    return if (needsSlowDown) {
      "Slow down • $prefix $label".trim()
    } else {
      "$prefix $label".trim()
    }
  }

  private fun extractSpeedMps(location: Location?): Double? {
    if (location == null) return null
    return try {
      val speedMethod = location::class.java.methods.firstOrNull {
        it.name == "getSpeed" && it.parameterTypes.isEmpty()
      } ?: return null
      val value = speedMethod.invoke(location)
      (value as? Number)?.toDouble()
    } catch (_: Exception) {
      null
    }
  }

  private fun extractBearingDeg(location: Location?): Double? {
    if (location == null) return null
    return try {
      val bearingMethod = location::class.java.methods.firstOrNull {
        it.name == "getBearing" && it.parameterTypes.isEmpty()
      } ?: return null
      val value = bearingMethod.invoke(location)
      val bearing = (value as? Number)?.toDouble() ?: return null
      ((bearing % 360.0) + 360.0) % 360.0
    } catch (_: Exception) {
      null
    }
  }

  private fun instantiateOptionalNativeView(className: String): View? {
    return try {
      val clazz = Class.forName(className)
      val ctor = clazz.getConstructor(android.content.Context::class.java)
      val instance = ctor.newInstance(reactContext)
      instance as? View
    } catch (_: Exception) {
      null
    }
  }

  private fun instantiateClass(className: String, vararg args: Any?): Any? {
    return try {
      val clazz = Class.forName(className)
      val ctor = clazz.constructors.firstOrNull { ctor ->
        ctor.parameterTypes.size == args.size &&
          ctor.parameterTypes.indices.all { index ->
            isArgumentCompatible(ctor.parameterTypes[index], args[index])
          }
      } ?: return null
      ctor.newInstance(*args)
    } catch (_: Exception) {
      null
    }
  }

  private fun requestPreferredCameraForMode(force: Boolean = false) {
    if (navigationMode == "PREVIEW") {
      requestOverviewCamera(force)
      return
    }
    requestFollowingCamera(force)
  }

  private fun handleFollowControlTap() {
    // Follow control keeps heading-up tracking by default.
    isNorthUpLocked = false
    updateFollowControlUiState()
    applyNorthUpViewportOverride()
    requestFollowingCamera(force = true)
  }

  private fun updateFollowControlUiState() {
    val background = GradientDrawable().apply {
      shape = GradientDrawable.OVAL
      setColor(
        if (isNorthUpLocked) Color.parseColor("#334EA8FF")
        else Color.parseColor("#CC0F172A")
      )
      setStroke(
        dpToPxInt(1.0),
        if (isNorthUpLocked) Color.parseColor("#99BBD8FF")
        else Color.parseColor("#66FFFFFF")
      )
    }
    followControlButton.background = background
    followControlButton.imageTintList = ColorStateList.valueOf(Color.WHITE)
    followControlButton.contentDescription =
      if (isNorthUpLocked) "North-up follow mode" else "Heading-up follow mode"
  }

  private fun applyNorthUpGestureLock() {
    val gesturesPlugin = readProperty(mapView, "gestures") ?: readProperty(mapView, "getGestures")
    val gesturesSettings =
      readProperty(gesturesPlugin, "settings") ?: readProperty(gesturesPlugin, "pluginSettings")
    val shouldLockRotate = isNorthUpLocked
    val rotateEnabled = !shouldLockRotate

    invokeIfPresent(gesturesPlugin, "setRotateEnabled", rotateEnabled)
    invokeIfPresent(gesturesSettings, "setRotateEnabled", rotateEnabled)
  }

  private fun enforceActiveNavigationUi(reason: String) {
    val mode = navigationMode
    if (mode != "TO_START" && mode != "ON_ROUTE") return
    ensureBottomBannerVisible(primaryRoute)
    syncManeuverBannerVisibility("active-$reason")
    bringNativeOverlaysToFront()
    applyNorthUpViewportOverride()
    applyNorthUpGestureLock()
    if (isNorthUpLocked) {
      enforceNorthUpCameraFallback()
    } else {
      enforceHeadingUpCameraFallback()
    }
  }

  private fun applyNorthUpViewportOverride() {
    applyNorthUpGestureLock()
    if (!isNorthUpLocked) {
      invokeIfPresent(viewportDataSource, "clearFollowingBearingPropertyOverride")
      return
    }
    try {
      viewportDataSource?.followingBearingPropertyOverride(0.0)
      viewportDataSource?.evaluate()
    } catch (_: Exception) {
      // Keep compatibility across SDK minor versions.
    }
  }

  private fun enforceNorthUpCameraFallback() {
    if (!isNorthUpLocked) return
    try {
      mapView.getMapboxMap().setCamera(
        CameraOptions.Builder()
          .bearing(0.0)
          .build()
      )
    } catch (_: Exception) {
      // Ignore fallback bearing enforcement failures.
    }
  }

  private fun enforceHeadingUpCameraFallback(location: Location? = latestEnhancedLocation) {
    if (isNorthUpLocked) return
    val liveBearing = extractBearingDeg(location) ?: return
    try {
      viewportDataSource?.followingBearingPropertyOverride(liveBearing)
      viewportDataSource?.evaluate()
    } catch (_: Exception) {
      // Keep compatibility across SDK minor versions.
    }
    try {
      mapView.getMapboxMap().setCamera(
        CameraOptions.Builder()
          .bearing(liveBearing)
          .build()
      )
    } catch (_: Exception) {
      // Ignore heading fallback bearing failures.
    }
  }

  private fun requestFollowingCamera(force: Boolean = false) {
    val camera = navigationCamera ?: return
    if (!force && isFollowingCameraRequested) return

    try {
      camera.requestNavigationCameraToFollowing()
      isFollowingCameraRequested = true
      isOverviewCameraRequested = false
      applyCameraPaddingForMode()
      updateFollowControlUiState()
      applyNorthUpViewportOverride()
      applyNorthUpGestureLock()
      if (isNorthUpLocked) {
        enforceNorthUpCameraFallback()
      } else if (navigationMode == "TO_START" || navigationMode == "ON_ROUTE") {
        enforceHeadingUpCameraFallback()
      }
      return
    } catch (_: Exception) {
      // Fall through to fallback centering.
    }

    val location = latestEnhancedLocation ?: return
    val liveBearing = extractBearingDeg(location) ?: 0.0
    val forceNorthUp = isNorthUpLocked
    val bearing = if (forceNorthUp) 0.0 else liveBearing
    try {
      mapView.getMapboxMap().setCamera(
        CameraOptions.Builder()
          .center(Point.fromLngLat(location.longitude, location.latitude))
          .zoom(16.0)
          .pitch(45.0)
          .bearing(bearing)
          .build()
      )
      isFollowingCameraRequested = true
      isOverviewCameraRequested = false
      updateFollowControlUiState()
      applyNorthUpViewportOverride()
      applyNorthUpGestureLock()
      if (forceNorthUp) {
        enforceNorthUpCameraFallback()
      } else if (navigationMode == "TO_START" || navigationMode == "ON_ROUTE") {
        enforceHeadingUpCameraFallback(location)
      }
    } catch (_: Exception) {
      // Keep running even if fallback centering fails.
    }
  }

  private fun requestOverviewCamera(force: Boolean = false) {
    if (navigationMode == "PREVIEW") {
      if (!force && isOverviewCameraRequested) return
      if (applyPreviewHardFitCamera()) {
        isOverviewCameraRequested = true
        isFollowingCameraRequested = false
        updateFollowControlUiState()
        applyNorthUpViewportOverride()
        applyNorthUpGestureLock()
        return
      }
    }

    val camera = navigationCamera ?: return
    if (!force && isOverviewCameraRequested) return

    try {
      camera.requestNavigationCameraToOverview()
      isOverviewCameraRequested = true
      isFollowingCameraRequested = false
      applyCameraPaddingForMode()
      updateFollowControlUiState()
      applyNorthUpViewportOverride()
      applyNorthUpGestureLock()
      return
    } catch (_: Exception) {
      // Fall through to a stable preview fallback.
    }

    val firstRoutePoint = dedupePoints(routeCoordinates).firstOrNull()
    val fallbackPoint = firstRoutePoint ?: destination ?: origin ?: return
    try {
      val fallbackZoom = if (navigationMode == "PREVIEW") PREVIEW_MIN_ZOOM else 15.0
      mapView.getMapboxMap().setCamera(
        CameraOptions.Builder()
          .center(fallbackPoint)
          .zoom(fallbackZoom)
          .pitch(0.0)
          .bearing(0.0)
          .build()
      )
      if (navigationMode == "PREVIEW") {
        Log.i(
          TAG,
          "Preview camera fallback: points=${dedupePoints(routeCoordinates).size} " +
            "center=${fallbackPoint.latitude()},${fallbackPoint.longitude()} zoom=$fallbackZoom"
        )
      }
      isOverviewCameraRequested = true
      isFollowingCameraRequested = false
      updateFollowControlUiState()
      applyNorthUpViewportOverride()
      applyNorthUpGestureLock()
    } catch (_: Exception) {
      // Ignore preview fallback camera failures.
    }
  }

  private fun requestFollowingCameraIfNeeded() {
    if (navigationMode != "TO_START" && navigationMode != "ON_ROUTE") return
    requestFollowingCamera(force = false)
    if (isNorthUpLocked) {
      enforceNorthUpCameraFallback()
    } else {
      enforceHeadingUpCameraFallback()
    }
  }

  private fun applyPreviewHardFitCamera(): Boolean {
    if (navigationMode != "PREVIEW") return false
    val points = dedupePoints(routeCoordinates)
    if (points.size < 2) return false

    var minLng = Double.POSITIVE_INFINITY
    var maxLng = Double.NEGATIVE_INFINITY
    var minLat = Double.POSITIVE_INFINITY
    var maxLat = Double.NEGATIVE_INFINITY

    points.forEach { point ->
      val lng = point.longitude()
      val lat = point.latitude()
      if (!lng.isFinite() || !lat.isFinite()) return@forEach
      minLng = kotlin.math.min(minLng, lng)
      maxLng = kotlin.math.max(maxLng, lng)
      minLat = kotlin.math.min(minLat, lat)
      maxLat = kotlin.math.max(maxLat, lat)
    }

    if (!minLng.isFinite() || !maxLng.isFinite() || !minLat.isFinite() || !maxLat.isFinite()) {
      return false
    }

    val centerLng = (minLng + maxLng) / 2.0
    val centerLat = (minLat + maxLat) / 2.0
    val targetZoom = estimatePreviewBoundsZoom(minLng, minLat, maxLng, maxLat)

    return try {
      mapView.getMapboxMap().setCamera(
        CameraOptions.Builder()
          .center(Point.fromLngLat(centerLng, centerLat))
          .zoom(targetZoom)
          .pitch(0.0)
          .bearing(0.0)
          .build()
      )
      applyCameraPaddingForMode()
      Log.i(
        TAG,
        "Preview camera hard-fit: points=${points.size} center=${centerLat},${centerLng} zoom=${"%.2f".format(Locale.US, targetZoom)}"
      )
      true
    } catch (e: Exception) {
      Log.w(TAG, "Preview camera hard-fit failed", e)
      false
    }
  }

  private fun estimatePreviewBoundsZoom(
    minLng: Double,
    minLat: Double,
    maxLng: Double,
    maxLat: Double
  ): Double {
    val sidePaddingPx = dpToPx(OVERVIEW_SIDE_PADDING_DP) * 2.0
    val verticalPaddingPx = dpToPx(OVERVIEW_TOP_PADDING_DP + OVERVIEW_BOTTOM_PADDING_DP)
    val viewportWidthPx = kotlin.math.max((currentRootWidth() - sidePaddingPx).toInt(), 1).toDouble()
    val viewportHeightPx = kotlin.math.max((currentRootHeight() - verticalPaddingPx).toInt(), 1).toDouble()

    val lngDeltaRaw = kotlin.math.abs(maxLng - minLng)
    val lngDelta = if (lngDeltaRaw > 180.0) 360.0 - lngDeltaRaw else lngDeltaRaw
    val lngFraction = kotlin.math.max(lngDelta / 360.0, 1e-7)

    val minSin = kotlin.math.sin(Math.toRadians(minLat))
    val maxSin = kotlin.math.sin(Math.toRadians(maxLat))
    val minMercator = kotlin.math.ln((1 + minSin) / (1 - minSin)) / 2.0
    val maxMercator = kotlin.math.ln((1 + maxSin) / (1 - maxSin)) / 2.0
    val latFraction = kotlin.math.max(kotlin.math.abs((maxMercator - minMercator) / Math.PI), 1e-7)

    val zoomX = kotlin.math.ln(viewportWidthPx / (256.0 * lngFraction)) / kotlin.math.ln(2.0)
    val zoomY = kotlin.math.ln(viewportHeightPx / (256.0 * latFraction)) / kotlin.math.ln(2.0)
    val computed = kotlin.math.min(zoomX, zoomY)

    return computed
      .coerceAtMost(PREVIEW_MAX_ZOOM)
      .coerceAtLeast(PREVIEW_MIN_ZOOM)
  }

  private fun createNavigationArrowPuck(): LocationPuck2D {
    val arrow = ImageHolder.from(com.drivest.app.R.drawable.ic_nav_puck_arrow)
    val transparentTop = ImageHolder.from(com.drivest.app.R.drawable.ic_nav_puck_transparent)
    return LocationPuck2D(
      // Prevent default top-marker fallback (blue dot) so only arrow puck is rendered.
      topImage = transparentTop,
      bearingImage = arrow,
      shadowImage = null,
      scaleExpression = "[\"interpolate\",[\"linear\"],[\"zoom\"],0,1.0,20,1.35]"
    )
  }

  private fun dpToPx(dp: Double): Double {
    val density = resources.displayMetrics.density.toDouble()
    return dp * density
  }

  private fun dpToPxInt(dp: Double): Int = dpToPx(dp).roundToInt()

  @OptIn(ExperimentalPreviewMapboxNavigationAPI::class)
  private fun applyTripSessionMode() {
    val nav = mapboxNavigation ?: return
    val targetMode = when {
      navigationMode == "PREVIEW" -> "STOPPED"
      shouldSimulate -> "REPLAY"
      else -> "LIVE"
    }
    if (targetMode == activeTripSessionMode) return

    try {
      nav.stopTripSession()
      activeTripSessionMode = "STOPPED"
    } catch (e: Exception) {
      Log.w(TAG, "stopTripSession failed while switching mode -> $targetMode", e)
    }

    if (targetMode == "STOPPED") {
      waitingForFreshLocationToStartTrip = false
      waitingForLayoutToStartTrip = false
      Log.i(TAG, "Trip session mode -> STOPPED (navigationMode=${navigationMode ?: "UNKNOWN"})")
      return
    }

    if (primaryRoute == null) {
      waitingForFreshLocationToStartTrip = false
      waitingForLayoutToStartTrip = false
      Log.i(
        TAG,
        "Trip session delayed: waiting for primary route (navigationMode=${navigationMode ?: "UNKNOWN"})"
      )
      return
    }

    if (!hasUsableLayout()) {
      if (!waitingForLayoutToStartTrip) {
        waitingForLayoutToStartTrip = true
        Log.i(
          TAG,
          "Trip session delayed: waiting for native view layout " +
            "(root=${width}x${height}, measured=${measuredWidth}x${measuredHeight})"
        )
      }
      return
    }
    waitingForLayoutToStartTrip = false

    if (!hasFreshLocationForTripSession()) {
      waitingForFreshLocationToStartTrip = false
      val now = System.currentTimeMillis()
      if (now - lastStaleLocationLogAtMs >= 3000L) {
        val ageSec = if (lastEnhancedLocationUpdateAtMs <= 0L) -1.0
        else (now - lastEnhancedLocationUpdateAtMs) / 1000.0
        val accuracy = lastEnhancedLocationAccuracyM
        Log.i(
          TAG,
          "Trip session starting without fresh enhanced location " +
            "(ageSec=${"%.1f".format(Locale.US, ageSec)}, accuracyM=${accuracy?.let { "%.1f".format(Locale.US, it) } ?: "unknown"})"
        )
        lastStaleLocationLogAtMs = now
      }
    }
    waitingForFreshLocationToStartTrip = false

    try {
      if (targetMode == "REPLAY") {
        nav.startReplayTripSession()
      } else {
        nav.startTripSession()
      }
      activeTripSessionMode = targetMode
      Log.i(TAG, "Trip session mode -> $targetMode (navigationMode=${navigationMode ?: "UNKNOWN"})")
    } catch (e: Exception) {
      Log.w(TAG, "Failed to start trip session mode -> $targetMode", e)
    }
  }

  private fun applyMutedPreferenceIfSupported(nav: MapboxNavigation?) {
    val target = nav ?: return
    val muteMethod = target::class.java.methods.firstOrNull {
      (it.name == "setVoiceInstructionsMuted" || it.name == "setMuted") &&
        it.parameterTypes.size == 1 &&
        it.parameterTypes[0] == Boolean::class.javaPrimitiveType
    } ?: return

    try {
      muteMethod.invoke(target, isMuted)
    } catch (_: Exception) {
      // Ignore if method cannot be invoked on this SDK build.
    }
    applyVoiceUiState()
  }

  private fun applyReroutePreferenceIfSupported(nav: MapboxNavigation) {
    // ON_ROUTE must remain strict: never allow reroute to avoid leaving predefined test geometry.
    val effectiveRerouteEnabled = if (navigationMode == "ON_ROUTE") false else rerouteEnabled

    // v3 API (preferred).
    try {
      nav.setRerouteEnabled(effectiveRerouteEnabled)
      Log.i(TAG, "setRerouteEnabled($effectiveRerouteEnabled) [mode=${navigationMode ?: "UNKNOWN"}]")
      return
    } catch (_: Exception) {
      // Fall through to reflection for compatibility with SDK variants.
    }

    val method = nav::class.java.methods.firstOrNull {
      it.name == "setRerouteEnabled" &&
        it.parameterTypes.size == 1 &&
        it.parameterTypes[0] == Boolean::class.javaPrimitiveType
    } ?: return

    try {
      method.invoke(nav, effectiveRerouteEnabled)
      Log.i(TAG, "setRerouteEnabled($effectiveRerouteEnabled) [reflection][mode=${navigationMode ?: "UNKNOWN"}]")
    } catch (_: Exception) {
      // Ignore if method cannot be invoked on this SDK build.
    }
  }

  private fun registerObservers() {
    val nav = mapboxNavigation ?: return
    if (observersRegistered) return

    nav.registerRoutesObserver(routesObserver)
    nav.registerLocationObserver(locationObserver)
    nav.registerRouteProgressObserver(routeProgressObserver)
    nav.registerVoiceInstructionsObserver(voiceInstructionsObserver)
    observersRegistered = true
  }

  private fun unregisterObservers() {
    val nav = mapboxNavigation ?: return
    if (!observersRegistered) return

    nav.unregisterRoutesObserver(routesObserver)
    nav.unregisterLocationObserver(locationObserver)
    nav.unregisterRouteProgressObserver(routeProgressObserver)
    nav.unregisterVoiceInstructionsObserver(voiceInstructionsObserver)
    observersRegistered = false
  }

  private fun stopGuidanceSafely() {
    val nav = mapboxNavigation ?: return
    try {
      nav.setNavigationRoutes(emptyList())
      nav.stopTripSession()
      try {
        navigationCamera?.requestNavigationCameraToIdle()
      } catch (_: Exception) {
        // Ignore shutdown camera issues.
      }
    } catch (_: Exception) {
      // Ignore shutdown issues.
    }
    isFollowingCameraRequested = false
    isOverviewCameraRequested = false
    primaryRoute = null
    primaryRouteId = null
    routeLinePrimaryRouteId = null
    currentActiveRouteId = null
    primaryRouteMode = null
    lastAppliedNavigationRouteId = null
    lastAppliedNavigationMode = null
    lastAppliedNavigationRouteCount = 0
    routeApplySequence = 0L
    activeRouteApplySequence = 0L
    pendingRouteApplyRequestId = 0L
    pendingRouteApplyMode = null
    pendingRouteApplyRoutes = null
    routeApplyScheduled = false
    suppressRoutesObserverRenderUntilMs = 0L
    routeLineSetSequence = 0L
    lastRouteApplyAtMs = 0L
    lastLoggedProgressRouteId = null
    routeRequestInFlight = false
    routeRequestQueued = false
    routeRequestEvaluationScheduled = false
    activeRouteRequestId = 0L
    requestedRouteSignature = null
    activeTripSessionMode = "STOPPED"
    toStartEnteredAtElapsedMs = 0L
    originUpdatedAtElapsedMs = 0L
    destinationUpdatedAtElapsedMs = 0L
    destinationNameUpdatedAtElapsedMs = 0L
    waitingForFreshLocationToStartTrip = false
    lastEnhancedLocationUpdateAtMs = 0L
    lastEnhancedLocationAccuracyM = null
    lastEnhancedLocationFixElapsedNs = null
    nativeManeuverCount = 0
    lastLoggedRootStage = null
    clearFollowingZoomOverride()
    tripProgressView.visibility = View.GONE
    previewTripSummaryView.visibility = View.GONE
    fallbackManeuverBannerView.visibility = View.GONE
    wayNameView.visibility = View.GONE
    lastWayNameText = null
    latestInstructionPrimaryText = null
    latestInstructionSecondaryText = null
    latestInstructionDistanceM = null
    lastLoggedFallbackBannerVisibility = null
    latestRouteDistanceRemainingM = null
    latestRouteFractionTraveled = 0.0
    speechApi?.cancel()
    voiceInstructionsPlayer?.clear()
    resetVoiceDedupCache()
    maneuverApi.cancel()
    syncManeuverBannerVisibility("stop-guidance")
  }

  private fun bringNativeOverlaysToFront() {
    maneuverView.bringToFront()
    fallbackManeuverBannerView.bringToFront()
    controlStack.bringToFront()
    rightInfoStack.bringToFront()
    tripProgressView.bringToFront()
    previewTripSummaryView.bringToFront()
  }

  private fun shouldShowNativeManeuverBanner(): Boolean {
    val mode = navigationMode
    if (mode != "PREVIEW" && mode != "TO_START" && mode != "ON_ROUTE") return false
    if (mode == "TO_START" || mode == "ON_ROUTE") return true
    return nativeManeuverCount > 0
  }

  private fun syncManeuverBannerVisibility(reason: String) {
    if (Looper.myLooper() != Looper.getMainLooper()) {
      runOnMainThread { syncManeuverBannerVisibility(reason) }
      return
    }
    val shouldShow = shouldShowNativeManeuverBanner()
    maneuverView.visibility = if (shouldShow) View.VISIBLE else View.GONE
    if (shouldShow) {
      ensureManeuverBannerLayout()
      maneuverView.alpha = 1f
      maneuverView.elevation = dpToPx(12.0).toFloat()
      maneuverView.translationZ = dpToPx(12.0).toFloat()
      maneuverView.bringToFront()
    }
    updateFallbackManeuverBannerVisibility(reason, shouldShow)
    val needsRefresh =
      shouldShow ||
        fallbackManeuverBannerView.visibility == View.VISIBLE ||
        tripProgressView.visibility == View.VISIBLE ||
        previewTripSummaryView.visibility == View.VISIBLE
    if (needsRefresh) {
      refreshNativeOverlayLayout("maneuver-$reason")
    }
    if (lastLoggedBannerVisibility != shouldShow) {
      if (shouldShow) {
        Log.d(TAG, "Native maneuver banner visible ($reason)")
      } else {
        Log.d(TAG, "Native maneuver banner hidden ($reason)")
      }
      lastLoggedBannerVisibility = shouldShow
    }
  }

  private fun updateFallbackManeuverBannerVisibility(reason: String, shouldShowNativeBanner: Boolean) {
    val hasNativeContent =
      shouldShowNativeBanner &&
        isActuallyVisibleOnScreen(maneuverView) &&
        (
          nativeManeuverCount > 0 ||
            maneuverView.childCount > 0
          )
    if (hasNativeContent) {
      fallbackManeuverBannerView.visibility = View.GONE
      lastLoggedFallbackBannerVisibility = false
      return
    }

    val primary = latestInstructionPrimaryText
    if (!shouldShowNativeBanner || primary.isNullOrBlank()) {
      fallbackManeuverBannerView.visibility = View.GONE
      if (lastLoggedFallbackBannerVisibility == true) {
        Log.d(TAG, "Fallback maneuver banner hidden ($reason)")
        lastLoggedFallbackBannerVisibility = false
      }
      return
    }

    val distanceLabel = formatInstructionDistanceLabel(latestInstructionDistanceM)
    val secondary = latestInstructionSecondaryText
    val firstLine = if (distanceLabel != null) "$distanceLabel • $primary" else primary
    fallbackManeuverBannerView.text =
      if (secondary.isNullOrBlank()) firstLine else "$firstLine\n$secondary"
    fallbackManeuverBannerView.visibility = View.VISIBLE
    fallbackManeuverBannerView.bringToFront()
    if (lastLoggedFallbackBannerVisibility != true) {
      Log.d(TAG, "Fallback maneuver banner visible ($reason)")
      lastLoggedFallbackBannerVisibility = true
    }
  }

  private fun refreshNativeOverlayLayout(reason: String) {
    if (Looper.myLooper() != Looper.getMainLooper()) {
      runOnMainThread { refreshNativeOverlayLayout(reason) }
      return
    }
    ensureManeuverBannerLayout()
    ensureBottomBannerLayout()
    maneuverView.requestLayout()
    fallbackManeuverBannerView.requestLayout()
    tripProgressView.requestLayout()
    previewTripSummaryView.requestLayout()
    requestLayout()
    post {
      bringNativeOverlaysToFront()
      val activeBottomView = if (tripProgressView.visibility == View.VISIBLE) tripProgressView else previewTripSummaryView
      if (
        (maneuverView.visibility == View.VISIBLE && actualRenderedWidth(maneuverView) == 0) ||
          ((activeBottomView.visibility == View.VISIBLE) && actualRenderedWidth(activeBottomView) == 0)
      ) {
        Log.d(TAG, "Overlay layout refresh pending ($reason)")
      }
    }
  }

  private fun formatInstructionDistanceLabel(distanceMeters: Double?): String? {
    if (distanceMeters == null || !distanceMeters.isFinite() || distanceMeters <= 0.0) return null
    return if (distanceMeters < 160.0) {
      "${(distanceMeters * 3.28084).roundToInt()} ft"
    } else {
      String.format(Locale.US, "%.1f mi", distanceMeters / 1609.344)
    }
  }

  private fun hideUndesiredNativeWidgets() {
    val undesiredClassTokens = listOf(
      "MapboxAudioGuidanceButton",
      "MapboxTripProgressView",
      "AudioGuidance",
      "TripProgress"
    )
    // Restrict this to the map's internal view tree only.
    // Avoid accidentally hiding our externally-added maneuver/banner and control overlays.
    hideViewsByClassToken(mapView, undesiredClassTokens)
  }

  private fun ensureLocationPuckAboveRouteLine(force: Boolean = false) {
    val now = System.currentTimeMillis()
    if (!force && now - lastPuckLayerEnsureAtMs < 1500L) return
    lastPuckLayerEnsureAtMs = now
    if (!isStyleLoaded) return

    val style = mapView.getMapboxMap().getStyle() ?: return

    // Route-line layer names can vary by SDK patch. Keep an ordered list from
    // lower-priority to higher-priority route layers and place the puck above all.
    val preferredRouteLayers = listOf(
      "mapbox-navigation-route-line-traversed-layer",
      "mapbox-navigation-route-line-trail-layer",
      "mapbox-navigation-route-line-casing",
      "mapbox-navigation-route-line-casing-layer",
      "mapbox-navigation-route-line-main",
      ACTIVE_ROUTE_LAYER_ID,
      "mapbox-navigation-route-line-main-layer",
      "mapbox-navigation-route-line-traffic-layer",
      "mapbox-navigation-route-line-restricted-section-layer",
      "mapbox-navigation-route-line-alternative-layer",
      "mapbox-navigation-route-line-alternative-casing-layer"
    )
    val existingRouteLayers = preferredRouteLayers.filter { layerId -> styleHasLayer(style, layerId) }
    if (existingRouteLayers.isEmpty()) {
      Log.d(TAG, "Location puck layering skipped: no route layer found in current style")
      return
    }
    val topRouteLayer = existingRouteLayers.last()

    invokeIfPresent(mapView.location, "setLayerAbove", topRouteLayer)
    invokeIfPresent(mapView.location, "layerAbove", topRouteLayer)

    // Compatibility fallback: some Maps SDK builds ignore location-component
    // layerAbove calls for custom route-line stacks, so explicitly move
    // known location indicator layers above the active route layer.
    val locationLayerCandidates = listOf(
      "mapbox-location-layer",
      "mapbox-location-bearing-layer",
      "mapbox-location-shadow-layer",
      "mapbox-location-stroke-layer",
      "mapbox-location-indicator-layer",
      "mapbox-location-indicator-bearing-layer",
      "mapbox-location-indicator-shadow-layer",
      "mapbox-location-indicator-stroke-layer",
      "mapbox-location-puck-layer",
      "mapbox-location-puck-bearing-layer",
      "mapbox-location-puck-shadow-layer"
    )
    existingRouteLayers.forEach { routeLayer ->
      locationLayerCandidates.forEach { locationLayer ->
        if (!styleHasLayer(style, locationLayer)) return@forEach
        moveStyleLayerAbove(style, locationLayer, routeLayer)
      }
    }
  }

  private fun ensureRouteArrowAboveRouteLine(style: Style) {
    val routeLayer = listOf(
      ACTIVE_ROUTE_LAYER_ID,
      "mapbox-navigation-route-line-main",
      "mapbox-navigation-route-line-main-layer",
      "mapbox-navigation-route-line-casing-layer"
    ).firstOrNull { layerId -> styleHasLayer(style, layerId) } ?: return

    val arrowLayerCandidates = listOf(
      "mapbox-navigation-arrow-shaft-layer",
      "mapbox-navigation-arrow-head-layer",
      "mapbox-navigation-arrow-shaft-casing-layer",
      "mapbox-navigation-arrow-head-casing-layer",
      "mapbox-navigation-route-arrow-shaft-layer",
      "mapbox-navigation-route-arrow-head-layer",
      "mapbox-navigation-route-arrow-shaft-casing-layer",
      "mapbox-navigation-route-arrow-head-casing-layer"
    )

    arrowLayerCandidates.forEach { arrowLayer ->
      if (!styleHasLayer(style, arrowLayer)) return@forEach
      moveStyleLayerAbove(style, arrowLayer, routeLayer)
    }
  }

  private fun moveStyleLayerAbove(style: Style, layerId: String, anchorLayerId: String) {
    if (!styleHasLayer(style, layerId) || !styleHasLayer(style, anchorLayerId)) return

    if (
      invokeIfPresentReturningSuccess(style, "moveStyleLayerAbove", layerId, anchorLayerId) ||
        invokeIfPresentReturningSuccess(style, "moveLayerAbove", layerId, anchorLayerId) ||
        invokeIfPresentReturningSuccess(style, "moveStyleLayer", layerId, anchorLayerId)
    ) {
      return
    }

    val layerPosition = instantiateClass(
      "com.mapbox.maps.extension.style.layers.LayerPosition",
      null,
      anchorLayerId,
      null
    ) ?: instantiateClass(
      "com.mapbox.maps.LayerPosition",
      null,
      anchorLayerId,
      null
    ) ?: instantiateClass(
      "com.mapbox.maps.extension.style.layers.LayerPosition",
      null,
      anchorLayerId
    ) ?: instantiateClass(
      "com.mapbox.maps.LayerPosition",
      null,
      anchorLayerId
    )

    if (layerPosition != null) {
      invokeIfPresentReturningSuccess(style, "moveStyleLayer", layerId, layerPosition)
      invokeIfPresentReturningSuccess(style, "moveLayer", layerId, layerPosition)
    }
  }

  private fun styleHasLayer(style: Style, layerId: String): Boolean {
    // Keep compatibility across Mapbox Maps patch versions where style query
    // method names differ.
    val existsByBooleanApi = callStyleLayerExists(style, "styleLayerExists", layerId)
      ?: callStyleLayerExists(style, "isStyleLayerExists", layerId)
    if (existsByBooleanApi != null) return existsByBooleanApi

    // Fallback for variants exposing direct layer fetch methods.
    val byGetLayer = callStyleLayerLookup(style, "getLayer", layerId)
      ?: callStyleLayerLookup(style, "getStyleLayer", layerId)
    return byGetLayer != null
  }

  private fun callStyleLayerExists(style: Style, methodName: String, layerId: String): Boolean? {
    val method = style::class.java.methods.firstOrNull {
      it.name == methodName &&
        it.parameterTypes.size == 1 &&
        it.parameterTypes[0] == String::class.java
    } ?: return null
    return try {
      method.invoke(style, layerId) as? Boolean
    } catch (_: Exception) {
      null
    }
  }

  private fun callStyleLayerLookup(style: Style, methodName: String, layerId: String): Any? {
    val method = style::class.java.methods.firstOrNull {
      it.name == methodName &&
        it.parameterTypes.size == 1 &&
        it.parameterTypes[0] == String::class.java
    } ?: return null
    return try {
      method.invoke(style, layerId)
    } catch (_: Exception) {
      null
    }
  }

  private fun ensureManeuverBannerLayout() {
    val expectedHeight = dpToPxInt(MANEUVER_HEIGHT_DP.toDouble())
    val sideMargin = dpToPxInt(MANEUVER_SIDE_MARGIN_DP.toDouble())
    val topMargin = dpToPxInt(MANEUVER_TOP_MARGIN_DP.toDouble())
    val rootWidth = currentRootWidth()
    val targetWidth =
      if (rootWidth > 0) {
        val maxByRatio = (rootWidth * MANEUVER_MAX_WIDTH_RATIO).roundToInt()
        val maxByMargins = rootWidth - sideMargin * 2
        kotlin.math.max(1, kotlin.math.min(maxByRatio, maxByMargins))
      } else {
        LayoutParams.WRAP_CONTENT
      }
    val existing = maneuverView.layoutParams as? LayoutParams
    val layoutParams = existing ?: LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT)
    var changed = false

    if (layoutParams.width != targetWidth) {
      layoutParams.width = targetWidth
      changed = true
    }
    if (layoutParams.height != LayoutParams.WRAP_CONTENT) {
      layoutParams.height = LayoutParams.WRAP_CONTENT
      changed = true
    }
    if (layoutParams.gravity != (Gravity.TOP or Gravity.CENTER_HORIZONTAL)) {
      layoutParams.gravity = Gravity.TOP or Gravity.CENTER_HORIZONTAL
      changed = true
    }
    if (
      layoutParams.leftMargin != sideMargin ||
      layoutParams.rightMargin != sideMargin ||
      layoutParams.topMargin != topMargin
    ) {
      layoutParams.setMargins(sideMargin, topMargin, sideMargin, 0)
      changed = true
    }
    maneuverView.minimumHeight = expectedHeight
    if (changed || maneuverView.layoutParams == null) {
      maneuverView.layoutParams = layoutParams
    }

    val fallbackExisting = fallbackManeuverBannerView.layoutParams as? LayoutParams
    val fallbackLayout =
      fallbackExisting ?: LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT)
    var fallbackChanged = false
    if (fallbackLayout.width != targetWidth) {
      fallbackLayout.width = targetWidth
      fallbackChanged = true
    }
    if (fallbackLayout.height != LayoutParams.WRAP_CONTENT) {
      fallbackLayout.height = LayoutParams.WRAP_CONTENT
      fallbackChanged = true
    }
    if (fallbackLayout.gravity != (Gravity.TOP or Gravity.CENTER_HORIZONTAL)) {
      fallbackLayout.gravity = Gravity.TOP or Gravity.CENTER_HORIZONTAL
      fallbackChanged = true
    }
    if (
      fallbackLayout.leftMargin != sideMargin ||
        fallbackLayout.rightMargin != sideMargin ||
        fallbackLayout.topMargin != topMargin
    ) {
      fallbackLayout.setMargins(sideMargin, topMargin, sideMargin, 0)
      fallbackChanged = true
    }
    fallbackManeuverBannerView.minimumHeight = expectedHeight
    if (fallbackChanged || fallbackManeuverBannerView.layoutParams == null) {
      fallbackManeuverBannerView.layoutParams = fallbackLayout
    }
  }

  private fun ensureBottomBannerLayout() {
    val sideMargin = dpToPxInt(TRIP_PROGRESS_SIDE_MARGIN_DP.toDouble())
    val bottomMargin = dpToPxInt(TRIP_PROGRESS_BOTTOM_MARGIN_DP.toDouble())
    val expectedMinHeight = dpToPxInt(TRIP_PROGRESS_MIN_HEIGHT_DP.toDouble())
    val rootWidth = currentRootWidth()
    val targetWidth =
      if (rootWidth > 0) {
        // Reserve room for side controls / close action and keep the banner slim.
        val reservedHorizontal = dpToPxInt(130.0)
        val maxByRatio = (rootWidth * TRIP_PROGRESS_MAX_WIDTH_RATIO).roundToInt()
        val maxByReserved = rootWidth - reservedHorizontal
        val maxByMargins = rootWidth - sideMargin * 2
        kotlin.math.max(1, kotlin.math.min(maxByRatio, kotlin.math.min(maxByReserved, maxByMargins)))
      } else {
        LayoutParams.WRAP_CONTENT
      }

    val tripExisting = tripProgressView.layoutParams as? LayoutParams
    val tripLayout =
      tripExisting ?: LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT)
    var tripChanged = false
    if (tripLayout.width != targetWidth) {
      tripLayout.width = targetWidth
      tripChanged = true
    }
    if (tripLayout.height != LayoutParams.WRAP_CONTENT) {
      tripLayout.height = LayoutParams.WRAP_CONTENT
      tripChanged = true
    }
    if (tripLayout.gravity != (Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL)) {
      tripLayout.gravity = Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL
      tripChanged = true
    }
    if (
      tripLayout.leftMargin != sideMargin ||
        tripLayout.rightMargin != sideMargin ||
        tripLayout.bottomMargin != bottomMargin
    ) {
      tripLayout.setMargins(sideMargin, 0, sideMargin, bottomMargin)
      tripChanged = true
    }
    tripProgressView.minimumHeight = expectedMinHeight
    if (tripChanged || tripProgressView.layoutParams == null) {
      tripProgressView.layoutParams = tripLayout
    }

    val previewExisting = previewTripSummaryView.layoutParams as? LayoutParams
    val previewLayout =
      previewExisting ?: LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT)
    var previewChanged = false
    if (previewLayout.width != targetWidth) {
      previewLayout.width = targetWidth
      previewChanged = true
    }
    if (previewLayout.height != LayoutParams.WRAP_CONTENT) {
      previewLayout.height = LayoutParams.WRAP_CONTENT
      previewChanged = true
    }
    if (previewLayout.gravity != (Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL)) {
      previewLayout.gravity = Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL
      previewChanged = true
    }
    if (
      previewLayout.leftMargin != sideMargin ||
        previewLayout.rightMargin != sideMargin ||
        previewLayout.bottomMargin != bottomMargin
    ) {
      previewLayout.setMargins(sideMargin, 0, sideMargin, bottomMargin)
      previewChanged = true
    }
    previewTripSummaryView.minimumHeight = expectedMinHeight
    if (previewChanged || previewTripSummaryView.layoutParams == null) {
      previewTripSummaryView.layoutParams = previewLayout
    }
  }

  private fun hideViewsByClassToken(root: View, classTokens: List<String>) {
    val className = root.javaClass.name
    if (classTokens.any { token -> className.contains(token, ignoreCase = true) }) {
      // Keep our custom controls and externally added native overlays.
      if (
        root !== audioGuidanceButton &&
        root !== controlStack &&
        root !== maneuverView &&
        root !== tripProgressView &&
        root !== previewTripSummaryView
      ) {
        root.visibility = View.GONE
      }
    }

    if (root is ViewGroup) {
      for (index in 0 until root.childCount) {
        hideViewsByClassToken(root.getChildAt(index), classTokens)
      }
    }
  }

  private fun logRootSize(stage: String) {
    val w = currentRootWidth()
    val h = currentRootHeight()
    if (w == lastLoggedRootWidth && h == lastLoggedRootHeight && stage == lastLoggedRootStage) return
    lastLoggedRootWidth = w
    lastLoggedRootHeight = h
    lastLoggedRootStage = stage
    Log.i(
      TAG,
      "Native view size[$stage]: root=${w}x${h} measured=${measuredWidth}x${measuredHeight} map=${mapView.width}x${mapView.height}"
    )
  }

  private fun runOnMainThread(block: () -> Unit) {
    if (Looper.myLooper() == Looper.getMainLooper()) {
      block()
    } else {
      post { block() }
    }
  }

  private fun emitProgressChange(payload: WritableMap) {
    val reactTag = this@DrivestNavigationView.id
    if (reactTag == View.NO_ID) return

    reactContext
      .getJSModule(RCTEventEmitter::class.java)
      .receiveEvent(reactTag, "onProgressChange", payload)
  }

  private fun appendNativeUiTelemetry(payload: WritableMap) {
    val rootWidth = when {
      currentRootWidth() > 0 -> currentRootWidth()
      mapView.width > 0 -> mapView.width
      mapView.measuredWidth > 0 -> mapView.measuredWidth
      else -> 0
    }
    val rootHeight = when {
      currentRootHeight() > 0 -> currentRootHeight()
      mapView.height > 0 -> mapView.height
      mapView.measuredHeight > 0 -> mapView.measuredHeight
      else -> 0
    }
    val bannerWidth = actualRenderedWidth(maneuverView)
    val bannerHeight = actualRenderedHeight(maneuverView)
    val bannerActuallyVisible = isActuallyVisibleOnScreen(maneuverView)

    val activeTripView =
      when {
        tripProgressView.visibility == View.VISIBLE -> tripProgressView
        previewTripSummaryView.visibility == View.VISIBLE -> previewTripSummaryView
        else -> null
      }
    val tripVisible = activeTripView != null
    val tripWidth = activeTripView?.let { actualRenderedWidth(it) } ?: 0
    val tripHeight = activeTripView?.let { actualRenderedHeight(it) } ?: 0
    val tripActuallyVisible = activeTripView?.let { isActuallyVisibleOnScreen(it) } ?: false

    payload.putBoolean("nativeBannerVisible", maneuverView.visibility == View.VISIBLE)
    payload.putBoolean("nativeBannerActuallyVisible", bannerActuallyVisible)
    payload.putBoolean("nativeFallbackBannerVisible", fallbackManeuverBannerView.visibility == View.VISIBLE)
    payload.putInt("nativeBannerWidth", bannerWidth)
    payload.putInt("nativeBannerHeight", bannerHeight)
    payload.putInt("nativeBannerChildCount", maneuverView.childCount)
    payload.putInt("nativeRootWidth", rootWidth.coerceAtLeast(0))
    payload.putInt("nativeRootHeight", rootHeight.coerceAtLeast(0))
    payload.putBoolean("nativeTripVisible", tripVisible)
    payload.putBoolean("nativeTripActuallyVisible", tripActuallyVisible)
    payload.putInt("nativeTripWidth", tripWidth)
    payload.putInt("nativeTripHeight", tripHeight)
    payload.putString("nativeMode", navigationMode ?: "UNKNOWN")
    payload.putInt("nativeManeuverCount", nativeManeuverCount)
  }

  private fun actualRenderedWidth(view: View): Int {
    return when {
      view.width > 0 -> view.width
      view.measuredWidth > 0 -> view.measuredWidth
      else -> 0
    }
  }

  private fun actualRenderedHeight(view: View): Int {
    return when {
      view.height > 0 -> view.height
      view.measuredHeight > 0 -> view.measuredHeight
      else -> 0
    }
  }

  private fun isActuallyVisibleOnScreen(view: View): Boolean {
    if (view.visibility != View.VISIBLE) return false
    if (!view.isShown) return false
    if (view.alpha <= 0.01f) return false
    if (actualRenderedWidth(view) <= 0 || actualRenderedHeight(view) <= 0) return false
    val rect = Rect()
    if (!view.getGlobalVisibleRect(rect)) return false
    return rect.width() > 0 && rect.height() > 0
  }

  private fun extractRouteFromProgress(progress: RouteProgress): NavigationRoute? {
    val route = readProperty(progress, "navigationRoute") ?: readProperty(progress, "route")
    return route as? NavigationRoute
  }

  private fun getNavigationRouteId(route: NavigationRoute?): String? {
    if (route == null) return null
    val direct = readProperty(route, "id") ?: readProperty(route, "getId")
    if (direct != null) return direct.toString()
    val directionsRoute = readProperty(route, "directionsRoute")
    val summary = readProperty(directionsRoute, "geometry")
      ?: readProperty(directionsRoute, "distance")
      ?: readProperty(directionsRoute, "duration")
    return summary?.toString()
  }

  private fun hasFreshLocationForTripSession(): Boolean {
    val now = System.currentTimeMillis()
    val ageMs = if (lastEnhancedLocationUpdateAtMs <= 0L) Long.MAX_VALUE else now - lastEnhancedLocationUpdateAtMs
    if (ageMs > LOCATION_FRESHNESS_MAX_MS) return false
    val fixElapsedNs = lastEnhancedLocationFixElapsedNs
    if (fixElapsedNs != null && fixElapsedNs > 0L) {
      val nowElapsedNs = SystemClock.elapsedRealtimeNanos()
      val fixAgeMs = (nowElapsedNs - fixElapsedNs) / 1_000_000.0
      if (fixAgeMs > LOCATION_FRESHNESS_MAX_MS.toDouble()) return false
    }
    val accuracy = lastEnhancedLocationAccuracyM
    if (accuracy != null && accuracy > 50.0) return false
    return latestEnhancedLocation != null
  }

  private fun resolveRequestedCoordinates(): List<Point> {
    val denseRouteCoordinates = dedupePoints(routeCoordinates)
    val explicitCoordinates = buildExplicitRequestedCoordinates()

    if (navigationMode == "TO_START") {
      // TO_START routing is explicitly user -> start point.
      // Prefer JS-provided points (already phase-aligned) and only fallback to live point.
      val explicitOrigin = origin
      val explicitStart = destination
      if (explicitOrigin != null && explicitStart != null) {
        return dedupePoints(listOf(explicitOrigin, explicitStart))
      }
      val liveUserPoint = latestEnhancedLocation?.let { Point.fromLngLat(it.longitude, it.latitude) }
      val routeStart = storedRouteStartPoint ?: denseRouteCoordinates.firstOrNull() ?: destination
      if (liveUserPoint == null || routeStart == null) return emptyList()
      return dedupePoints(listOf(liveUserPoint, routeStart))
    }

    if (navigationMode == "ON_ROUTE") {
      // ON_ROUTE should prefer explicit JS-provided origin/destination/waypoints first.
      // This lets the request start from the current live position at phase handoff
      // and prevents guidance from staying pinned to stale TO_START geometry.
      if (explicitCoordinates.size >= 2) {
        return explicitCoordinates
      }
      // Fallback when explicit props are temporarily unavailable.
      if (denseRouteCoordinates.size >= 2) {
        return denseRouteCoordinates
      }
      return explicitCoordinates
    }

    if (navigationMode == "PREVIEW" && denseRouteCoordinates.size >= 2) {
      return denseRouteCoordinates
    }

    if (explicitCoordinates.size >= 2) {
      return explicitCoordinates
    }

    if (denseRouteCoordinates.size >= 2) {
      return denseRouteCoordinates
    }

    return explicitCoordinates
  }

  private fun hasUsableLayout(): Boolean {
    val rootWidth = if (width > 0) width else measuredWidth
    val rootHeight = if (height > 0) height else measuredHeight
    return isAttachedToWindow && rootWidth > 0 && rootHeight > 0
  }

  private fun currentRootWidth(): Int {
    if (width > 0) return width
    if (measuredWidth > 0) return measuredWidth
    return 0
  }

  private fun currentRootHeight(): Int {
    if (height > 0) return height
    if (measuredHeight > 0) return measuredHeight
    return 0
  }

  private fun buildExplicitRequestedCoordinates(): List<Point> {
    val from = origin ?: return emptyList()
    val to = destination ?: return emptyList()

    val allCoords = mutableListOf(from)
    if (waypoints.isNotEmpty()) allCoords.addAll(waypoints)
    allCoords.add(to)

    return dedupePoints(allCoords)
  }

  private fun reduceForRouteRequest(points: List<Point>): List<Point> {
    if (points.size <= MAX_ROUTE_REQUEST_POINTS) return points

    val out = ArrayList<Point>(MAX_ROUTE_REQUEST_POINTS)
    out.add(points.first())

    val lastIndex = points.lastIndex
    val slots = MAX_ROUTE_REQUEST_POINTS - 2
    val step = lastIndex.toDouble() / (slots + 1)
    for (i in 1..slots) {
      val index = (i * step).roundToInt().coerceIn(1, lastIndex - 1)
      out.add(points[index])
    }

    out.add(points.last())
    return dedupePoints(out)
  }

  private fun parseRouteCoordinates(value: ReadableArray?): List<Point> {
    if (value == null || value.size() == 0) return emptyList()

    val points = ArrayList<Point>(value.size())
    for (i in 0 until value.size()) {
      val coord = readPoint(value.getArray(i))
      if (coord != null) points.add(coord)
    }

    return points
  }

  private fun readPoint(value: ReadableArray?): Point? {
    if (value == null || value.size() < 2) return null
    val lng = value.getDouble(0)
    val lat = value.getDouble(1)
    return Point.fromLngLat(lng, lat)
  }

  private fun dedupePoints(points: List<Point>): List<Point> {
    if (points.isEmpty()) return emptyList()

    val filtered = ArrayList<Point>()
    var last = points.first()
    filtered.add(last)

    for (i in 1 until points.size) {
      val curr = points[i]
      if (isSamePoint(last, curr)) continue
      filtered.add(curr)
      last = curr
    }

    return filtered
  }

  private fun isSamePoint(a: Point, b: Point): Boolean {
    return abs(a.latitude() - b.latitude()) < 1e-6 && abs(a.longitude() - b.longitude()) < 1e-6
  }

  private fun distanceMeters(a: Point, b: Point): Double {
    val earthRadiusM = 6371000.0
    val lat1 = Math.toRadians(a.latitude())
    val lat2 = Math.toRadians(b.latitude())
    val dLat = lat2 - lat1
    val dLon = Math.toRadians(b.longitude() - a.longitude())
    val sinLat = kotlin.math.sin(dLat / 2)
    val sinLon = kotlin.math.sin(dLon / 2)
    val h = sinLat * sinLat + kotlin.math.cos(lat1) * kotlin.math.cos(lat2) * sinLon * sinLon
    return 2 * earthRadiusM * kotlin.math.asin(kotlin.math.sqrt(h))
  }

  private fun buildRouteSignature(points: List<Point>): String {
    val mode = navigationMode.orEmpty()
    if (mode == "TO_START" && points.size >= 2) {
      val start = points.first()
      val end = points.last()
      val startKey = String.format(Locale.US, "%.4f,%.4f", start.longitude(), start.latitude())
      val endKey = String.format(Locale.US, "%.5f,%.5f", end.longitude(), end.latitude())
      return "$mode#$startKey->$endKey#${destinationName.orEmpty()}"
    }
    val coords = points.joinToString("|") { point ->
      "${point.longitude()},${point.latitude()}"
    }
    return "$mode#$coords#${destinationName.orEmpty()}"
  }

  private fun resolvePreferredLocale(): Locale {
    return try {
      val locales = reactContext.resources.configuration.locales
      if (locales != null && !locales.isEmpty) {
        locales[0] ?: Locale.getDefault()
      } else {
        Locale.getDefault()
      }
    } catch (_: Exception) {
      Locale.getDefault()
    }
  }

  private fun resolvePreferredRouteLanguageTag(locale: Locale): String {
    val language = locale.language.lowercase(Locale.ROOT)
    if (language == "en") {
      // Prefer UK English for non-US English locales.
      return if (locale.country.equals("US", ignoreCase = true)) "en-US" else "en-GB"
    }
    return locale.toLanguageTag().takeIf { it.isNotBlank() } ?: "en-GB"
  }

  private fun sanitizeForUi(value: String?): String? {
    if (value.isNullOrBlank()) return null

    val stripped = value
      .replace(Regex("<[^>]*>"), " ")
      .replace(Regex("\\s+"), " ")
      .trim()

    if (stripped.equals("undefined", ignoreCase = true)) return null
    if (stripped.equals("null", ignoreCase = true)) return null

    return stripped.takeIf { it.isNotEmpty() }
  }

  private fun readProperty(target: Any?, propertyOrGetter: String): Any? {
    if (target == null) return null
    return try {
      if (propertyOrGetter.startsWith("get")) {
        val method = target::class.java.methods.firstOrNull {
          it.name == propertyOrGetter && it.parameterTypes.isEmpty()
        } ?: return null
        method.invoke(target)
      } else {
        val method = target::class.java.methods.firstOrNull {
          (it.name == propertyOrGetter ||
            it.name == "get${propertyOrGetter.replaceFirstChar { c -> c.uppercase() }}") &&
            it.parameterTypes.isEmpty()
        } ?: return null
        method.invoke(target)
      }
    } catch (_: Exception) {
      null
    }
  }

  private fun readNumberProperty(target: Any?, propertyOrGetter: String): Double? {
    val value = readProperty(target, propertyOrGetter) ?: return null
    return (value as? Number)?.toDouble()
  }

  private fun invokeIfPresent(target: Any?, methodName: String, vararg args: Any?) {
    if (target == null) return

    val method = target::class.java.methods.firstOrNull {
      if (it.name != methodName || it.parameterTypes.size != args.size) return@firstOrNull false
      it.parameterTypes.indices.all { index ->
        isArgumentCompatible(it.parameterTypes[index], args[index])
      }
    } ?: return

    try {
      method.invoke(target, *args)
    } catch (_: Exception) {
      // Ignore optional API mismatch across SDK patch versions.
    }
  }

  private fun invokeIfPresentReturningSuccess(target: Any?, methodName: String, vararg args: Any?): Boolean {
    if (target == null) return false

    val method = target::class.java.methods.firstOrNull {
      if (it.name != methodName || it.parameterTypes.size != args.size) return@firstOrNull false
      it.parameterTypes.indices.all { index ->
        isArgumentCompatible(it.parameterTypes[index], args[index])
      }
    } ?: return false

    return try {
      method.invoke(target, *args)
      true
    } catch (_: Exception) {
      false
    }
  }

  private fun isArgumentCompatible(parameterType: Class<*>, arg: Any?): Boolean {
    if (arg == null) return !parameterType.isPrimitive
    val boxedParam = boxType(parameterType)
    val boxedArg = boxType(arg.javaClass)
    return boxedParam.isAssignableFrom(boxedArg)
  }

  private fun boxType(type: Class<*>): Class<*> {
    if (!type.isPrimitive) return type
    return when (type) {
      java.lang.Boolean.TYPE -> java.lang.Boolean::class.java
      java.lang.Byte.TYPE -> java.lang.Byte::class.java
      java.lang.Short.TYPE -> java.lang.Short::class.java
      java.lang.Character.TYPE -> java.lang.Character::class.java
      java.lang.Integer.TYPE -> java.lang.Integer::class.java
      java.lang.Long.TYPE -> java.lang.Long::class.java
      java.lang.Float.TYPE -> java.lang.Float::class.java
      java.lang.Double.TYPE -> java.lang.Double::class.java
      java.lang.Void.TYPE -> java.lang.Void::class.java
      else -> type
    }
  }
}
