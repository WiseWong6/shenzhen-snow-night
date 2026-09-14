# 原声钢琴采样署名与许可

采样作品：**Salamander Grand Piano**。录音作者：**Alexander Holm**。
录音乐器为 Yamaha C5 三角钢琴。项目只使用单音录音，不使用现成曲目。

采样由 Tone.js 官方音频仓库发布。本项目保留原始 MP3 字节，使用 Base64 编码
打包为 `piano-samples.js`，以便本地页面直接打开；没有再压缩、归一化或修改原声录音。
播放准备时只可能移除起音前最多 0.15 秒的极轻静音，并保留约 1 毫秒缓冲。
实际演奏会为邻近音高调整播放速度并调节每个音的响度及淡出。

许可：**Creative Commons Attribution 3.0 Unported（CC BY 3.0，署名 3.0 未本地化版）**。
请在分享本项目或含该录音的衍生内容时保留作者、作品名称、来源和许可说明；若有改动，
注明改动。许可允许复制、改编及商业使用，但不得暗示录音作者支持本项目。
不可施加与许可相冲突的额外法律或技术限制。

- [Tone.js 官方采样来源与作者许可说明](https://github.com/Tonejs/audio/blob/master/salamander/README)
- [Tone.js 官方采样目录](https://github.com/Tonejs/audio/tree/master/salamander)
- [CC BY 3.0 许可说明](https://creativecommons.org/licenses/by/3.0/)
- [CC BY 3.0 完整许可条款](https://creativecommons.org/licenses/by/3.0/legalcode)

## 使用的原始单音

原始地址前缀为 `https://tonejs.github.io/audio/salamander/`。
每份录音的来源地址与 SHA-256 校验值同时保存在生成的脚本数据里。

| 单音文件 | 音高编号 | 原始字节数 |
| --- | ---: | ---: |
| Fs2.mp3 | 42 | 102320 |
| A2.mp3 | 45 | 81678 |
| C3.mp3 | 48 | 78036 |
| Fs3.mp3 | 54 | 77933 |
| C4.mp3 | 60 | 78718 |
| Fs4.mp3 | 66 | 68219 |
| C5.mp3 | 72 | 68920 |
| Fs5.mp3 | 78 | 51597 |
| A5.mp3 | 81 | 45747 |

合计 653168 字节。Base64 只改变数据表示方式，不改变音频内容。

## 重新打包

将上述九个原始 MP3 放在同一个临时目录后，运行：

```sh
node scripts/build-piano-samples.cjs /absolute/path/to/downloaded-samples
```

打包脚本会检查文件大小、计算校验值并输出普通 JavaScript 文件。网页不需要服务器、
运行时下载、跨文件模块导入或第三方音频库；采样在用户选择播放后才解码。
