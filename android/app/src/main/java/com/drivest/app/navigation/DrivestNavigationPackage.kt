package com.drivest.app.navigation

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class DrivestNavigationPackage : ReactPackage {
  override fun createNativeModules(reactContext: ReactApplicationContext) = emptyList<com.facebook.react.bridge.NativeModule>()

  override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
    return listOf(DrivestNavigationViewManager(reactContext))
  }
}
