#import <React/RCTViewManager.h>

@interface RCT_EXTERN_MODULE(DrivestNavigationViewManager, RCTViewManager)

RCT_EXPORT_VIEW_PROPERTY(accessToken, NSString)
RCT_EXPORT_VIEW_PROPERTY(styleURL, NSString)
RCT_EXPORT_VIEW_PROPERTY(navigationMode, NSString)
RCT_EXPORT_VIEW_PROPERTY(origin, NSArray)
RCT_EXPORT_VIEW_PROPERTY(destination, NSArray)
RCT_EXPORT_VIEW_PROPERTY(destinationName, NSString)
RCT_EXPORT_VIEW_PROPERTY(routeCoordinates, NSArray)
RCT_EXPORT_VIEW_PROPERTY(waypoints, NSArray)
RCT_EXPORT_VIEW_PROPERTY(shouldSimulateRoute, BOOL)
RCT_EXPORT_VIEW_PROPERTY(isMuted, BOOL)
RCT_EXPORT_VIEW_PROPERTY(rerouteEnabled, BOOL)
RCT_EXPORT_VIEW_PROPERTY(onProgressChange, RCTDirectEventBlock)

@end
