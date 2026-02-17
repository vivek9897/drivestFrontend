package com.drivest.app.navigation

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.annotations.ReactProp
import com.facebook.react.common.MapBuilder

class DrivestNavigationViewManager(
  private val reactContext: ReactApplicationContext
) : SimpleViewManager<DrivestNavigationView>() {
  override fun getName(): String = "DrivestNavigationView"

  override fun createViewInstance(reactContext: ThemedReactContext): DrivestNavigationView {
    return DrivestNavigationView(reactContext)
  }

  override fun onDropViewInstance(view: DrivestNavigationView) {
    super.onDropViewInstance(view)
    view.onDropViewInstance()
  }

  override fun getExportedCustomDirectEventTypeConstants(): MutableMap<String, Any> {
    return MapBuilder.of(
      "onProgressChange",
      MapBuilder.of("registrationName", "onProgressChange")
    )
  }

  @ReactProp(name = "origin")
  fun setOrigin(view: DrivestNavigationView, origin: ReadableArray?) {
    view.setOrigin(origin)
  }

  @ReactProp(name = "accessToken")
  fun setAccessToken(view: DrivestNavigationView, accessToken: String?) {
    view.setAccessToken(accessToken)
  }

  @ReactProp(name = "styleURL")
  fun setStyleURL(view: DrivestNavigationView, styleURL: String?) {
    view.setStyleURL(styleURL)
  }

  @ReactProp(name = "navigationMode")
  fun setNavigationMode(view: DrivestNavigationView, navigationMode: String?) {
    view.setNavigationMode(navigationMode)
  }

  @ReactProp(name = "destination")
  fun setDestination(view: DrivestNavigationView, destination: ReadableArray?) {
    view.setDestination(destination)
  }

  @ReactProp(name = "routeCoordinates")
  fun setRouteCoordinates(view: DrivestNavigationView, routeCoordinates: ReadableArray?) {
    view.setRouteCoordinates(routeCoordinates)
  }

  @ReactProp(name = "destinationName")
  fun setDestinationName(view: DrivestNavigationView, destinationName: String?) {
    view.setDestinationName(destinationName)
  }

  @ReactProp(name = "waypoints")
  fun setWaypoints(view: DrivestNavigationView, waypoints: ReadableArray?) {
    view.setWaypoints(waypoints)
  }

  @ReactProp(name = "shouldSimulateRoute", defaultBoolean = false)
  fun setShouldSimulateRoute(view: DrivestNavigationView, shouldSimulateRoute: Boolean) {
    view.setShouldSimulateRoute(shouldSimulateRoute)
  }

  @ReactProp(name = "isMuted", defaultBoolean = false)
  fun setIsMuted(view: DrivestNavigationView, isMuted: Boolean) {
    view.setIsMuted(isMuted)
  }

  @ReactProp(name = "rerouteEnabled", defaultBoolean = false)
  fun setRerouteEnabled(view: DrivestNavigationView, rerouteEnabled: Boolean) {
    view.setRerouteEnabled(rerouteEnabled)
  }
}
