package expo.modules.metakaiscanner

import android.content.Context
import android.view.ViewGroup
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.Preview
import androidx.camera.core.resolutionselector.ResolutionSelector
import androidx.camera.core.resolutionselector.ResolutionStrategy
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleOwner
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView
import java.util.concurrent.Executors

/** The back camera, filling the view, reading barcodes from what it sees. */
class MetakaiScannerView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  private val onScan by EventDispatcher()
  private val preview =
    PreviewView(context).apply {
      // A texture view, so React Native views can sit above it without z-order surprises.
      implementationMode = PreviewView.ImplementationMode.COMPATIBLE
      scaleType = PreviewView.ScaleType.FILL_CENTER
    }
  private val executor = Executors.newSingleThreadExecutor()
  private val analyzer = BarcodeAnalyzer { text, format -> onScan(mapOf("data" to text, "type" to format)) }
  private var provider: ProcessCameraProvider? = null

  /** Barcodes are only read while this is true, so a result can be shown without more arriving. */
  var active: Boolean
    get() = analyzer.active
    set(value) {
      analyzer.active = value
    }

  // Let Android lay out the camera view inside this one.
  override val shouldUseAndroidLayout = true

  init {
    addView(preview, ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    bind()
  }

  override fun onDetachedFromWindow() {
    provider?.unbindAll()
    provider = null
    super.onDetachedFromWindow()
  }

  private fun bind() {
    val owner = appContext.currentActivity as? LifecycleOwner ?: return
    val future = ProcessCameraProvider.getInstance(context)
    future.addListener(
      {
        val cameraProvider = future.get()
        provider = cameraProvider
        val useCasePreview = Preview.Builder().build().also { it.surfaceProvider = preview.surfaceProvider }
        // 720p is enough for a barcode held a hand's width away, and fast to read.
        val analysis =
          ImageAnalysis.Builder()
            .setResolutionSelector(
              ResolutionSelector.Builder()
                .setResolutionStrategy(ResolutionStrategy(android.util.Size(1280, 720), ResolutionStrategy.FALLBACK_RULE_CLOSEST_HIGHER_THEN_LOWER))
                .build(),
            )
            .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
            .build()
            .also { it.setAnalyzer(executor, analyzer) }
        cameraProvider.unbindAll()
        cameraProvider.bindToLifecycle(owner, CameraSelector.DEFAULT_BACK_CAMERA, useCasePreview, analysis)
      },
      ContextCompat.getMainExecutor(context),
    )
  }
}
