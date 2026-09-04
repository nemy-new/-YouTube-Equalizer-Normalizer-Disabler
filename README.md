# YouTube Volume Controller & Equalizer

[English](#english) | [日本語 (Japanese)](#日本語) | [简体中文 (Simplified Chinese)](#简体中文) | [한국어 (Korean)](#한국어) | [Русский (Russian)](#русский)

---

<a id="english"></a>
## English

A professional-grade audio enhancement extension for YouTube. This tool allows users to bypass YouTube's automatic volume normalization and fine-tune their audio experience using a dual-mode equalizer (3-Band and 10-Band), a preamp, and a brickwall limiter.

### Features
- **Normalizer Disabler**: Restores original track dynamics by disabling YouTube's automatic loudness leveling.
- **Dual Equalizer Modes**: 
  - **3-Band (Basic)**: Quick control over Low, Mid, and High frequencies with rotary knobs.
  - **10-Band (Pro)**: Precise 10-band slider controls ranging from 32Hz to 16kHz.
- **Preset Management**: Built-in default presets (Bass Boost, Vocal, Cinematic, etc.) and the ability to save, name, and delete your own Custom Presets.
- **Preamp (Master Gain)**: Powerful overall volume control to boost quiet videos.
- **Brickwall Limiter**: Prevents all digital clipping and distortion even with heavy EQ boosts.
- **Seamless UI**: Beautiful dark-mode interface integrated directly into the YouTube player controls.

### Installation

#### Chrome Web Store
https://chromewebstore.google.com/detail/mahadhmfdbkmghggoakjckbmjfbhkmkm?utm_source=item-share-cb

#### Manual Installation (For Edge, Firefox, and Chrome local)

First, download this repository as a ZIP file and extract it.

##### Google Chrome & Microsoft Edge
1. Open the extensions page.
   - Chrome: `chrome://extensions/`
   - Edge: `edge://extensions/`
2. Enable **Developer mode**.
3. Click **Load unpacked** and select the extracted directory.

##### Mozilla Firefox
1. Open the debugging page: `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on...**
3. Select the `manifest.json` file inside the extracted directory.
*(Note: Firefox temporary add-ons are removed when the browser restarts.)*

### Disclaimer
*The developer assumes no responsibility for any damage to audio hardware, hearing, or any other damages resulting from the use of this extension. Please use at your own risk and avoid excessive volume levels.

### License
This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

<a id="日本語"></a>
## 日本語

YouTubeの自動音量調整（ノーマライザー）を解除し、プロ仕様のイコライザー（3バンド/10バンド）、プリアンプ、リミッターを提供するオーディオ拡張機能です。

### 特徴
- **ノーマライザー無効化**: YouTube独自の音量平均化を解除し、クリエイターが意図した本来のダイナミクスと迫力を復元します。
- **2つのイコライザーモード**:
  - **3-Band (Basic)**: 低音・中域・高音を直感的なツマミでサクッと調整。
  - **10-Band (Pro)**: 32Hzから16kHzまでの10バンドを細かく追い込める本格スライダー。
- **プリセット機能**: 用意されたデフォルト設定（低音ブーストやボーカル強調など）に加え、自分好みの設定に名前をつけて保存できる「カスタムプリセット機能」を搭載。
- **プリアンプ**: 音が小さい動画でも、全体の音量を底上げ・調整可能。
- **ブリックウォール・リミッター**: 強力な過入力防止。音量を極端に上げても不快な音割れ（クリッピング）を自動で防ぎます。
- **UI**: YouTubeの動画プレイヤーに自然に溶け込むように設計しました。

### インストール方法

#### Chrome ウェブストア
https://chromewebstore.google.com/detail/mahadhmfdbkmghggoakjckbmjfbhkmkm?utm_source=item-share-cb

#### 手動インストール（Edge, Firefox, ローカル用）

まず、このリポジトリをZIP形式でダウンロードし、解凍しておきます。

##### Google Chrome & Microsoft Edge
1. 拡張機能ページを開きます。
   - Chrome: `chrome://extensions/`
   - Edge: `edge://extensions/`
2. 「デベロッパー モード」をオンにします。
3. 「パッケージ化されていない拡張機能を読み込む」を選択し、解凍したフォルダを指定します。

##### Mozilla Firefox
1. デバッグページ `about:debugging#/runtime/this-firefox` を開きます。
2. 「一時的なアドオンを読み込む...」をクリックします。
3. 解凍したフォルダの中にある `manifest.json` を選択します。
*(注意: Firefoxの一時的なアドオンは、ブラウザを再起動すると解除されます。)*

### 免責事項
※本拡張機能の利用によって生じたオーディオ機器の故障、破損、聴覚への影響、その他いかなる損害についても、開発者は一切の責任を負いません。音量の上げすぎには十分ご注意の上、自己責任でご使用ください。

### ライセンス
このプロジェクトは MIT License のもとで公開されています。詳細は [LICENSE](LICENSE) ファイルをご覧ください。

---

<a id="한국어"></a>
## 한국어

YouTube의 자동 볼륨 조절(노멀라이저)을 비활성화하고 3밴드/10밴드 이퀄라이저를 제공하는 오디오 확장 프로그램입니다.

### 특징
- **노멀라이저 비활성화**: YouTube의 자동 볼륨 평준화를 해제하여 원본 트랙의 다이내믹스를 복원합니다.
- **2가지 이퀄라이저 모드**:
  - **3-Band (Basic)**: 저음, 중음, 고음을 직관적인 노브로 쉽게 조절합니다.
  - **10-Band (Pro)**: 32Hz에서 16kHz까지 세밀하게 조절할 수 있는 10밴드 슬라이더를 제공합니다.
- **프리셋 기능**: 기본 제공 프리셋(베이스 부스트, 보컬 강조 등) 외에 자신만의 설정을 저장하고 관리할 수 있습니다.
- **프리앰프**: 소리가 작은 동영상의 전체 볼륨을 높일 수 있습니다.
- **클리핑 방지 (Limiter)**: 극단적인 이퀄라이저 부스트 시에도 소리 깨짐(클리핑)을 방지합니다.
- **UI**: YouTube 동영상 플레이어에 자연스럽게 통합되는 디자인입니다.

### 설치 방법

#### Chrome 웹 스토어
https://chromewebstore.google.com/detail/mahadhmfdbkmghggoakjckbmjfbhkmkm?utm_source=item-share-cb

#### 수동 설치 (Edge, Firefox, 로컬용)

먼저 이 저장소를 ZIP 파일로 다운로드하고 압축을 풉니다.

##### Google Chrome & Microsoft Edge
1. 확장 프로그램 페이지를 엽니다.
   - Chrome: `chrome://extensions/`
   - Edge: `edge://extensions/`
2. **개발자 모드**를 켭니다.
3. **압축해제된 확장 프로그램을 로드합니다**를 클릭하고 압축을 푼 폴더를 선택합니다.

##### Mozilla Firefox
1. 디버깅 페이지 `about:debugging#/runtime/this-firefox`를 엽니다.
2. **임시 애드온 로드...**를 클릭합니다.
3. 압축을 푼 폴더 안의 `manifest.json` 파일을 선택합니다.
*(참고: Firefox 임시 애드온은 브라우저를 다시 시작하면 제거됩니다.)*

### 라이선스
이 프로젝트는 MIT 라이선스에 따라 라이선스가 부여됩니다. 자세한 내용은 [LICENSE](LICENSE) 파일을 참조하세요.

---

<a id="русский"></a>
## Русский

Расширение для улучшения звука на YouTube. Отключает автоматическую нормализацию громкости и предоставляет профессиональный эквалайзер (3-полосный/10-полосный), предусилитель и лимитер.

### Особенности
- **Отключение нормализатора**: Восстанавливает оригинальную динамику звука, отключая выравнивание громкости YouTube.
- **Два режима эквалайзера**:
  - **3-Band (Basic)**: Быстрая настройка низких, средних и высоких частот с помощью регуляторов.
  - **10-Band (Pro)**: Точные 10-полосные ползунки от 32 Гц до 16 кГц.
- **Управление пресетами**: Встроенные пресеты (Усиление басов, Вокал и т.д.) и возможность сохранять свои настройки.
- **Предусилитель**: Общее усиление громкости для тихих видео.
- **Лимитер (Антиклип)**: Предотвращает искажения и клиппинг даже при сильном усилении частот.
- **Интерфейс**: Темная тема, органично встроенная в плеер YouTube.

### Установка

#### Интернет-магазин Chrome
https://chromewebstore.google.com/detail/mahadhmfdbkmghggoakjckbmjfbhkmkm?utm_source=item-share-cb

#### Ручная установка (для Edge, Firefox и локального Chrome)

Сначала скачайте этот репозиторий в виде ZIP-архива и распакуйте его.

##### Google Chrome и Microsoft Edge
1. Откройте страницу расширений.
   - Chrome: `chrome://extensions/`
   - Edge: `edge://extensions/`
2. Включите **Режим разработчика**.
3. Нажмите **Загрузить распакованное расширение** и выберите распакованную папку.

##### Mozilla Firefox
1. Откройте страницу отладки: `about:debugging#/runtime/this-firefox`
2. Нажмите **Загрузить временное дополнение...**
3. Выберите файл `manifest.json` внутри распакованной папки.
*(Примечание: Временные дополнения Firefox удаляются после перезапуска браузера.)*

### Лицензия
Этот проект распространяется под лицензией MIT — подробности см. в файле [LICENSE](LICENSE).

---

<a id="简体中文"></a>
## 简体中文

YouTube 音频增强扩展程序。禁用 YouTube 的自动音量标准化，并提供专业级均衡器（3 段/10 段）、前置放大器和防破音限制器。

### 特点
- **禁用音量标准化**：解除 YouTube 的自动音量平衡，恢复原始音轨的动态范围。
- **两种均衡器模式**：
  - **3-Band (Basic)**：通过旋钮快速调整低音、中音和高音。
  - **10-Band (Pro)**：从 32Hz 到 16kHz 的 10 段精确滑块控制。
- **预设管理**：内置预设（低音增强、人声等），并支持保存、命名和管理您自己的自定义预设。
- **前置放大器**：为声音较小的视频提供整体音量提升。
- **防破音 (Limiter)**：即使大幅度增强频率，也能自动防止声音失真和破音。
- **无缝 UI**：精美的深色模式界面，完美融入 YouTube 播放器控制栏。

### 安装方法

#### Chrome 网上应用店
https://chromewebstore.google.com/detail/mahadhmfdbkmghggoakjckbmjfbhkmkm?utm_source=item-share-cb

#### 手动安装（适用于 Edge、Firefox 和本地 Chrome）

首先，将此存储库下载为 ZIP 文件并解压缩。

##### Google Chrome & Microsoft Edge
1. 打开扩展程序页面。
   - Chrome: `chrome://extensions/`
   - Edge: `edge://extensions/`
2. 开启 **开发者模式**。
3. 点击 **加载已解压的扩展程序**，然后选择解压后的文件夹。

##### Mozilla Firefox
1. 打开调试页面：`about:debugging#/runtime/this-firefox`
2. 点击 **临时载入附加组件...**
3. 选择解压后文件夹内的 `manifest.json` 文件。
*(注意：Firefox 的临时附加组件会在浏览器重新启动后移除。)*

### 许可证
本项目采用 MIT 许可证 — 详情请参见 [LICENSE](LICENSE) 文件。
