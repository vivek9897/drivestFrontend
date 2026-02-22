package com.drivest.navigation.session

import android.content.Context
import android.util.Log
import com.drivest.navigation.practice.PracticeRoute
import com.drivest.navigation.settings.PreferredUnitsSetting
import com.drivest.navigation.settings.VoiceModeSetting
import com.mapbox.geojson.Point
import com.mapbox.maps.MapView
import com.mapbox.navigation.core.MapboxNavigation
import com.mapbox.navigation.core.replay.route.ReplayProgressObserver
import com.mapbox.navigation.core.trip.session.RouteProgressObserver
import com.mapbox.navigation.core.trip.session.VoiceInstructionsObserver

class NavigationSessionManager(
    private val mapboxNavigation: MapboxNavigation,
    private val routeProgressObserver: RouteProgressObserver,
    private val voiceInstructionsObserver: VoiceInstructionsObserver,
    private val createReplayObserver: (() -> ReplayProgressObserver)?,
    private val clearVoiceQueue: () -> Unit,
    private val onStateChanged: (SessionState) -> Unit,
    private val onPreviewPracticeRoute: (PracticeRoute) -> Unit,
    private val onPreviewDestination: (Point) -> Unit
) {

    enum class Mode {
        PRACTICE,
        NAVIGATION
    }

    enum class SessionState {
        BROWSE,
        PREVIEW,
        ACTIVE
    }

    private class ObserverRegistry {
        var attached = false
        var replayObserver: ReplayProgressObserver? = null
    }

    private val observerRegistry = ObserverRegistry()
    private var mode: Mode = Mode.PRACTICE
    private var state: SessionState = SessionState.BROWSE
    private var mapView: MapView? = null
    private var voiceModeSetting: VoiceModeSetting = VoiceModeSetting.ALL
    private var preferredUnitsSetting: PreferredUnitsSetting = PreferredUnitsSetting.UK_MPH

    fun init(context: Context, mapView: MapView) {
        this.mapView = mapView
        Log.d(TAG, "Session manager init: ${context.packageName}")
        emitState(SessionState.BROWSE)
    }

    fun setMode(mode: Mode) {
        this.mode = mode
        if (state == SessionState.ACTIVE) {
            return
        }
        emitState(SessionState.BROWSE)
    }

    fun setVoiceMode(mode: VoiceModeSetting) {
        voiceModeSetting = mode
        Log.d(TAG, "Voice mode updated: ${mode.storageValue}")
    }

    fun setPreferredUnits(units: PreferredUnitsSetting) {
        preferredUnitsSetting = units
        Log.d(TAG, "Preferred units updated: ${units.storageValue}")
    }

    fun previewPracticeRoute(route: PracticeRoute) {
        if (mode != Mode.PRACTICE) return
        onPreviewPracticeRoute(route)
        emitState(SessionState.PREVIEW)
    }

    fun previewDestination(dest: Point) {
        if (mode != Mode.NAVIGATION) return
        onPreviewDestination(dest)
        emitState(SessionState.PREVIEW)
    }

    fun start() {
        if (state != SessionState.PREVIEW) return
        addObservers()
        emitState(SessionState.ACTIVE)
    }

    fun stop() {
        removeObservers()
        clearVoiceQueue()
        mapboxNavigation.setNavigationRoutes(emptyList())
        emitState(SessionState.BROWSE)
    }

    fun onDestroy() {
        stop()
        mapView = null
        Log.d(TAG, "Session manager destroyed")
    }

    private fun addObservers() {
        if (observerRegistry.attached) {
            Log.d(TAG, "ObserverRegistry addObservers skipped (already attached)")
            return
        }
        mapboxNavigation.registerRouteProgressObserver(routeProgressObserver)
        mapboxNavigation.registerVoiceInstructionsObserver(voiceInstructionsObserver)
        createReplayObserver?.invoke()?.let { replayObserver ->
            observerRegistry.replayObserver = replayObserver
            mapboxNavigation.registerRouteProgressObserver(replayObserver)
        }
        observerRegistry.attached = true
        Log.d(TAG, "ObserverRegistry addObservers attached=1")
    }

    private fun removeObservers() {
        if (!observerRegistry.attached) {
            Log.d(TAG, "ObserverRegistry removeObservers skipped (none attached)")
            return
        }
        mapboxNavigation.unregisterRouteProgressObserver(routeProgressObserver)
        mapboxNavigation.unregisterVoiceInstructionsObserver(voiceInstructionsObserver)
        observerRegistry.replayObserver?.let {
            mapboxNavigation.unregisterRouteProgressObserver(it)
        }
        observerRegistry.replayObserver = null
        observerRegistry.attached = false
        Log.d(TAG, "ObserverRegistry removeObservers attached=0")
    }

    private fun emitState(newState: SessionState) {
        state = newState
        onStateChanged(newState)
    }

    private companion object {
        private const val TAG = "NavigationSessionMgr"
    }
}
