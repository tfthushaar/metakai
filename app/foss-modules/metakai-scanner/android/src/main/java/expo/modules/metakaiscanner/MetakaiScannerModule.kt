package expo.modules.metakaiscanner

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/** A camera view that reads food barcodes, using CameraX and ZXing instead of Google's ML Kit. */
class MetakaiScannerModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("MetakaiScanner")

    View(MetakaiScannerView::class) {
      Events("onScan")

      Prop("active") { view: MetakaiScannerView, active: Boolean -> view.active = active }
    }
  }
}
