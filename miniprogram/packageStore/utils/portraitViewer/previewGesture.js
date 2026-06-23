/** 全屏预览手势（对齐 hometown-photowall post-preview-behavior） */

const PREVIEW_DIR_LOCK_PX = 12;
const PREVIEW_DIR_BIAS = 1.4;
const PREVIEW_VERTICAL_EXIT_RATIO = 0.12;
const PREVIEW_DOUBLE_TAP_ZOOM = 2.5;
const PREVIEW_DOUBLE_TAP_MS = 300;
const PREVIEW_SINGLE_TAP_MS = 300;

function rpxToPx(rpx) {
  const sys = wx.getSystemInfoSync();
  return Math.round((rpx / 750) * sys.windowWidth);
}

function aspectFitLayout(containerW, containerH, imgAR) {
  const containerAR = containerW / containerH;
  let visW;
  let visH;
  if (imgAR > containerAR) {
    visW = containerW;
    visH = containerW / imgAR;
  } else {
    visH = containerH;
    visW = containerH * imgAR;
  }
  return {
    visW,
    visH,
    offsetX: (containerW - visW) / 2,
    offsetY: (containerH - visH) / 2
  };
}

function createPreviewGestureMethods() {
  return {
    _initPreviewMetrics() {
      const sys = wx.getSystemInfoSync();
      this._windowWidth = sys.windowWidth;
      this._windowHeight = sys.windowHeight;
      const safeBottom = (sys.safeArea && sys.safeArea.bottom) || sys.screenHeight;
      const inset = Math.max(0, sys.screenHeight - safeBottom);
      this._bottomBarH = rpxToPx(84) + inset;
    },

    _resetPreviewTransformState() {
      this._currentTx = 0;
      this._currentTy = 0;
      this._currentScale = 1;
      this._currentSy = 1;
      this._gestureState = null;
      this._hasMoved = false;
      this._previewPinchActive = false;
    },

    _previewPhotoAR(index) {
      const results = this.properties.results || [];
      const item = results[index];
      if (item?.aspectRatio) return item.aspectRatio;
      const dim = this._previewPhotoDims && this._previewPhotoDims[index];
      if (dim?.w && dim?.h) return dim.w / dim.h;
      return 3 / 4;
    },

    _getPreviewScale() {
      return this._currentScale !== undefined ? this._currentScale : 1;
    },

    _getTransformValues() {
      const sx = this._getPreviewScale();
      const sy = this._currentSy !== undefined ? this._currentSy : sx;
      return { tx: this._currentTx || 0, ty: this._currentTy || 0, sx, sy };
    },

    _applyPreviewTransform(tx, ty, sx, sy) {
      this._currentTx = tx;
      this._currentTy = ty;
      this._currentScale = sx;
      this._currentSy = sy;
      const zoomed = sx > 1.02;
      const patch = {
        previewTransform: `translate(${tx}px, ${ty}px) scale(${sx}, ${sy})`
      };
      if (zoomed !== this.data.previewProgressHidden) {
        patch.previewProgressHidden = zoomed;
      }
      this.setData(patch);
    },

    _previewTouchDelta(touch) {
      if (!touch || !this._touchStart) return { dx: 0, dy: 0 };
      return {
        dx: touch.clientX - this._touchStart.x,
        dy: touch.clientY - this._touchStart.y
      };
    },

    _isPreviewHorizontalMove(dx, dy) {
      return (
        Math.abs(dx) >= PREVIEW_DIR_LOCK_PX &&
        Math.abs(dx) >= Math.abs(dy) * PREVIEW_DIR_BIAS
      );
    },

    _isPreviewVerticalDismissMove(dx, dy) {
      return (
        Math.abs(dy) >= PREVIEW_DIR_LOCK_PX &&
        Math.abs(dy) >= Math.abs(dx) * PREVIEW_DIR_BIAS
      );
    },

    _getDist(t0, t1) {
      const dx = t0.clientX - t1.clientX;
      const dy = t0.clientY - t1.clientY;
      return Math.sqrt(dx * dx + dy * dy);
    },

    _clearPreviewSingleTapTimer() {
      if (this._previewSingleTapTimer) {
        clearTimeout(this._previewSingleTapTimer);
        this._previewSingleTapTimer = null;
      }
    },

    updatePreviewProgressPos(index) {
      if (!this.data.previewVisible) return;
      const results = this.properties.results || [];
      if (results.length <= 1) return;
      const screenW = this._windowWidth || wx.getSystemInfoSync().windowWidth;
      const screenH = this._windowHeight || wx.getSystemInfoSync().windowHeight;
      const imgAR = this._previewPhotoAR(index);
      const layout = aspectFitLayout(screenW, screenH, imgAR);
      const bottomGap = screenH - layout.offsetY - layout.visH;
      const pad = 8;
      this.setData({
        previewProgressStyle: `bottom:${Math.max(bottomGap, 0) + pad}px;`
      });
    },

    _beginPreviewPinch(touches) {
      if (!touches || touches.length < 2) return;
      this._clearPreviewSingleTapTimer();
      this._gestureState = 'pinch';
      this._hasMoved = true;
      const { tx, ty, sx, sy } = this._getTransformValues();
      this._startTx = tx;
      this._startTy = ty;
      this._startSx = sx;
      this._startSy = sy;
      this._pinchStartDist = this._getDist(touches[0], touches[1]);
      this._pinchStartCenter = {
        x: (touches[0].clientX + touches[1].clientX) / 2,
        y: (touches[0].clientY + touches[1].clientY) / 2
      };
      if (!this.data.previewTouchCapture) {
        this.setData({ previewTouchCapture: true, previewProgressHidden: true });
      }
    },

    _applyPreviewPinch(touches) {
      if (!touches || touches.length < 2 || !this._pinchStartDist) return;
      const dist = this._getDist(touches[0], touches[1]);
      let scale = this._startSx * (dist / this._pinchStartDist);
      scale = Math.max(0.3, Math.min(scale, 4));
      const sy = Math.max(0.3, Math.min(scale, 4));
      const cx = (touches[0].clientX + touches[1].clientX) / 2;
      const cy = (touches[0].clientY + touches[1].clientY) / 2;
      const pinchX = this._pinchStartCenter.x;
      const pinchY = this._pinchStartCenter.y;
      const scaleRatio = scale / this._startSx;
      const newTx = pinchX - (pinchX - this._startTx) * scaleRatio + (cx - pinchX);
      const newTy = pinchY - (pinchY - this._startTy) * scaleRatio + (cy - pinchY);
      this._applyPreviewTransform(newTx, newTy, scale, sy);
    },

    _previewNeedsSnap() {
      const { tx, ty, sx } = this._getTransformValues();
      return sx > 1.02 || Math.abs(tx) > 1 || Math.abs(ty) > 1;
    },

    _snapPreviewZoom() {
      this._gestureState = null;
      this.setData({
        previewTouchCapture: false,
        previewAnimating: true,
        previewAnimClass: 'animating',
        previewProgressHidden: false
      });
      this._applyPreviewTransform(0, 0, 1, 1);
      setTimeout(() => {
        if (!this.data.previewVisible) return;
        this.setData({ previewAnimating: false, previewAnimClass: '' });
      }, 300);
    },

    _handoffPreviewPan(touch) {
      if (!touch) return;
      const { tx, ty, sx, sy } = this._getTransformValues();
      this._gestureState = 'pan';
      this._startTx = tx;
      this._startTy = ty;
      this._startSx = sx;
      this._startSy = sy;
      this._touchStart = { x: touch.clientX, y: touch.clientY };
    },

    _applyVerticalDismissVisual(dy) {
      const h = this._windowHeight || 667;
      const progress = Math.min(Math.abs(dy) / (h * 0.38), 1);
      const scale = 1 - progress * 0.1;
      this._applyPreviewTransform(0, dy, scale, scale);
      this.setData({ previewProgressHidden: true });
    },

    _resetVerticalDismissPreview(animate) {
      this.setData({
        previewTouchCapture: false,
        previewAnimating: !!animate,
        previewAnimClass: animate ? 'animating' : '',
        previewProgressHidden: false
      });
      this._applyPreviewTransform(0, 0, 1, 1);
      if (animate) {
        setTimeout(() => this.setData({ previewAnimating: false, previewAnimClass: '' }), 300);
      }
    },

    _onPreviewCapturedMove(e) {
      const t = e.touches;
      if (this._gestureState === 'in-bottom') return;

      if (this._gestureState === 'pinch' && t.length >= 2) {
        this._applyPreviewPinch(t);
        return;
      }

      if (
        t.length === 1 &&
        this._touchStart &&
        (this._gestureState === 'pan' || this._gestureState === 'vertical-dismiss')
      ) {
        const dy = t[0].clientY - this._touchStart.y;
        if (this._gestureState === 'vertical-dismiss') {
          this._hasMoved = true;
          this._applyVerticalDismissVisual(dy);
          return;
        }
        if (this._gestureState === 'pan') {
          const dx = t[0].clientX - this._touchStart.x;
          this._hasMoved = true;
          this._applyPreviewTransform(
            this._startTx + dx,
            this._startTy + dy,
            this._startSx,
            this._startSy
          );
        }
      }
    },

    _onPreviewDoubleTapZoom(touch) {
      this._clearPreviewSingleTapTimer();
      const { sx } = this._getTransformValues();
      if (sx > 1.05) {
        this._snapPreviewZoom();
        return;
      }
      const scale = PREVIEW_DOUBLE_TAP_ZOOM;
      const cx = touch?.clientX ?? this._windowWidth / 2;
      const cy = touch?.clientY ?? this._windowHeight / 2;
      const tx = (1 - scale) * cx;
      const ty = (1 - scale) * cy;
      this.setData({
        previewTouchCapture: true,
        previewAnimating: true,
        previewAnimClass: 'animating',
        previewProgressHidden: true
      });
      this._applyPreviewTransform(tx, ty, scale, scale);
      setTimeout(() => {
        if (!this.data.previewVisible) return;
        this.setData({ previewAnimating: false, previewAnimClass: '' });
      }, 300);
    },

    onPreviewTouchStart(e) {
      const t = e.touches;
      this._touchStartTime = Date.now();
      this._hasMoved = false;

      if (this.data.previewAnimating) return;

      const { tx, ty, sx, sy } = this._getTransformValues();
      this._startTx = tx;
      this._startTy = ty;
      this._startSx = sx;
      this._startSy = sy;

      if (t.length === 2) {
        this._beginPreviewPinch(t);
      } else if (t.length === 1) {
        this._touchStart = { x: t[0].clientX, y: t[0].clientY };
        const windowHeight = this._windowHeight;
        const bottomBarH = this._bottomBarH;
        if (t[0].clientY >= windowHeight - bottomBarH) {
          this._gestureState = 'in-bottom';
          this.setData({ previewTouchCapture: false });
          return;
        }
        if (sx > 1.05) {
          this._gestureState = 'pan';
          this.setData({ previewTouchCapture: true, previewProgressHidden: true });
        } else {
          this._gestureState = 'single';
          this.setData({ previewTouchCapture: false });
        }
      }
    },

    onPreviewTouchMove(e) {
      const t = e.touches;

      if (t.length >= 2) {
        if (this._gestureState !== 'pinch') {
          this._beginPreviewPinch(t);
        }
        this._applyPreviewPinch(t);
        return;
      }

      if (this._gestureState === 'horizontal') {
        return;
      }

      if (this.data.previewTouchCapture) {
        return this._onPreviewCapturedMove(e);
      }

      const { sx } = this._getTransformValues();
      if (
        sx <= 1.05 &&
        this._gestureState !== 'vertical-dismiss' &&
        this._gestureState !== 'pinch' &&
        this._gestureState !== 'pan' &&
        t.length === 1 &&
        this._touchStart
      ) {
        const dx = t[0].clientX - this._touchStart.x;
        const dy = t[0].clientY - this._touchStart.y;
        if (Math.abs(dx) < PREVIEW_DIR_LOCK_PX && Math.abs(dy) < PREVIEW_DIR_LOCK_PX) {
          return;
        }
        if (this._isPreviewHorizontalMove(dx, dy)) {
          this._gestureState = 'horizontal';
          this._hasMoved = true;
          this._clearPreviewSingleTapTimer();
          return;
        }
        if (!this._isPreviewVerticalDismissMove(dx, dy)) {
          return;
        }
        this._gestureState = 'vertical-dismiss';
        this.setData({ previewTouchCapture: true });
        return this._onPreviewCapturedMove(e);
      }

      if (t.length === 1 && this._touchStart && this._startSx > 1.05) {
        const dx = t[0].clientX - this._touchStart.x;
        const dy = t[0].clientY - this._touchStart.y;
        if (Math.abs(dx) > PREVIEW_DIR_LOCK_PX || Math.abs(dy) > PREVIEW_DIR_LOCK_PX) {
          this._hasMoved = true;
          this._gestureState = 'pan';
          if (!this.data.previewTouchCapture) {
            this.setData({ previewTouchCapture: true, previewProgressHidden: true });
          }
          return this._onPreviewCapturedMove(e);
        }
      }
    },

    onPreviewTouchEnd(e) {
      const remaining = (e.touches && e.touches.length) || 0;
      if (remaining > 0) {
        if (this._gestureState === 'pinch' && remaining === 1) {
          this._handoffPreviewPan(e.touches[0]);
        }
        return;
      }

      const touch = e.changedTouches && e.changedTouches[0];
      const { dx, dy } = this._previewTouchDelta(touch);
      const totalMove = Math.sqrt(dx * dx + dy * dy);

      if (this._gestureState === 'horizontal' || this._isPreviewHorizontalMove(dx, dy)) {
        this._gestureState = null;
        this._hasMoved = true;
        this._clearPreviewSingleTapTimer();
        this.setData({ previewTouchCapture: false });
        return;
      }

      const touchY = touch?.clientY ?? 0;
      const bottomBarTop = this._windowHeight - this._bottomBarH;
      const startedInBottom = this._gestureState === 'in-bottom';
      const endedInBottom = touchY >= bottomBarTop;
      if (startedInBottom || endedInBottom) {
        this._gestureState = null;
        return;
      }

      const { ty } = this._getTransformValues();
      const dt = Date.now() - this._touchStartTime;

      if (this._gestureState === 'vertical-dismiss') {
        const threshold = (this._windowHeight || 667) * PREVIEW_VERTICAL_EXIT_RATIO;
        if (Math.abs(ty) >= threshold) {
          this.onClosePreview();
        } else {
          this._resetVerticalDismissPreview(true);
        }
        this._gestureState = null;
        return;
      }

      if (!this._hasMoved && totalMove < PREVIEW_DIR_LOCK_PX && dt < 250) {
        const now = Date.now();
        if (now - (this._lastPreviewTapAt || 0) < PREVIEW_DOUBLE_TAP_MS) {
          this._onPreviewDoubleTapZoom(touch);
          this._lastPreviewTapAt = 0;
          return;
        }
        this._lastPreviewTapAt = now;
        this._previewSingleTapTimer = setTimeout(() => {
          this._lastPreviewTapAt = 0;
          const { sx } = this._getTransformValues();
          if (sx > 1.05) {
            this._snapPreviewZoom();
            return;
          }
          this.onClosePreview();
        }, PREVIEW_SINGLE_TAP_MS);
        return;
      }

      if (
        (this._gestureState === 'pinch' || this._gestureState === 'pan') &&
        this._getTransformValues().sx < 1
      ) {
        this._gestureState = null;
        this.setData({ previewTouchCapture: false, previewProgressHidden: false });
        this._applyPreviewTransform(0, 0, 1, 1);
        return;
      }

      if (
        (this._gestureState === 'pinch' || this._gestureState === 'pan') &&
        this._previewNeedsSnap()
      ) {
        this._snapPreviewZoom();
        return;
      }

      this._gestureState = null;
      this.setData({ previewTouchCapture: false });
    }
  };
}

module.exports = {
  PREVIEW_DOUBLE_TAP_MS,
  PREVIEW_SINGLE_TAP_MS,
  createPreviewGestureMethods
};
