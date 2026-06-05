# YouTube Volume Controller & Equalizer

A professional-grade audio enhancement extension for YouTube. This tool allows users to bypass YouTube's automatic volume normalization and fine-tune their audio experience using a dual-mode equalizer (3-Band and 10-Band), a preamp, and a brickwall limiter.

YouTubeの自動音量調整（ノーマライザー）を解除し、プロ仕様のイコライザー（3バンド/10バンド）、プリアンプ、リミッターを提供するオーディオ拡張機能です。


## Features | 特徴

### 🇺🇸 English
- **Normalizer Disabler**: Restores original track dynamics by disabling YouTube's automatic loudness leveling.
- **Dual Equalizer Modes**: 
  - **3-Band (Basic)**: Quick control over Low, Mid, and High frequencies with rotary knobs.
  - **10-Band (Pro)**: Precise 10-band slider controls ranging from 32Hz to 16kHz.
- **Preset Management**: Built-in default presets (Bass Boost, Vocal, Cinematic, etc.) and the ability to save, name, and delete your own Custom Presets.
- **Preamp (Master Gain)**: Powerful overall volume control to boost quiet videos.
- **Brickwall Limiter**: Prevents all digital clipping and distortion even with heavy EQ boosts.
- **Seamless UI**: Beautiful dark-mode interface integrated directly into the YouTube player controls.

---

### 🇯🇵 日本語
- **ノーマライザー無効化**: YouTube独自の音量平均化を解除し、クリエイターが意図した本来のダイナミクスと迫力を復元します。
- **2つのイコライザーモード**:
  - **3-Band (Basic)**: 低音・中域・高音を直感的なツマミでサクッと調整。
  - **10-Band (Pro)**: 32Hzから16kHzまでの10バンドを細かく追い込める本格スライダー。
- **プリセット機能**: 用意されたデフォルト設定（低音ブーストやボーカル強調など）に加え、自分好みの設定に名前をつけて保存できる「カスタムプリセット機能」を搭載。
- **プリアンプ**: 音が小さい動画でも、全体の音量を底上げ・調整可能。
- **ブリックウォール・リミッター**: 強力な過入力防止。音量を極端に上げても不快な音割れ（クリッピング）を自動で防ぎます。
- **UI**: YouTubeの動画プレイヤーに自然に溶け込むように設計しました。

## Installation | インストール方法

### Chrome Web Store
https://chromewebstore.google.com/detail/mahadhmfdbkmghggoakjckbmjfbhkmkm?utm_source=item-share-cb

### Manual Installation (For Edge, Firefox, and Chrome local) / 手動インストール（Edge, Firefox, ローカル用）

First, download this repository as a ZIP file and extract it.
まず、このリポジトリをZIP形式でダウンロードし、解凍しておきます。

#### 🔵 Google Chrome & Microsoft Edge
1. Open the extensions page. / 拡張機能ページを開きます。
   - Chrome: `chrome://extensions/`
   - Edge: `edge://extensions/`
2. Enable **Developer mode**. / 「デベロッパー モード」をオンにします。
3. Click **Load unpacked** and select the extracted directory. / 「パッケージ化されていない拡張機能を読み込む」を選択し、解凍したフォルダを指定します。

#### 🦊 Mozilla Firefox
1. Open the debugging page: `about:debugging#/runtime/this-firefox` / デバッグページ `about:debugging#/runtime/this-firefox` を開きます。
2. Click **Load Temporary Add-on...** / 「一時的なアドオンを読み込む...」をクリックします。
3. Select the `manifest.json` file inside the extracted directory. / 解凍したフォルダの中にある `manifest.json` を選択します。
*(Note: Firefox temporary add-ons are removed when the browser restarts. / 注意: Firefoxの一時的なアドオンは、ブラウザを再起動すると解除されます。)*

## License | ライセンス
MIT License
