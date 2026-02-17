import Foundation
import React

@objc(DrivestNavigationViewManager)
class DrivestNavigationViewManager: RCTViewManager {
  override func view() -> UIView! {
    return DrivestNavigationView()
  }

  override static func requiresMainQueueSetup() -> Bool {
    return true
  }
}
