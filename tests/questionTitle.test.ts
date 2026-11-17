import assert from "node:assert/strict";
import test from "node:test";
import { buildQuestionTitle } from "../src/questionTitle";

test("a shared document title stays readable without its URL", () => {
  assert.equal(
    buildQuestionTitle("回稿-Part2-nesting-function https://drive.google.com/file/d/123/view"),
    "Part2 nesting function 回稿"
  );
});

test("flattened document headings do not absorb numbered link explanations", () => {
  for (const numbering of ["1、", "1. ", "（1）", "一、"]) {
    assert.equal(
      buildQuestionTitle(`回稿-Part2-nesting-function ${numbering}链接中是本次回稿的资料 https://drive.google.com/file/d/123/view`),
      "Part2 nesting function 回稿"
    );
  }
  assert.equal(
    buildQuestionTitle("[回稿-Part2-nesting-function.docx](https://drive.google.com/file/d/123/view) 1、链接中包含文稿 2、附件中是补充材料"),
    "Part2 nesting function 回稿"
  );
});

test("attachment labels, sizes and upload metadata are not question topics", () => {
  assert.equal(
    buildQuestionTitle("文件类型：DOCX\n文件大小：2.4 MB\n文件名：回稿-Part2-nesting-function.docx (DOCX, 2.4 MB)\n上传成功\n1、链接中是原文"),
    "Part2 nesting function 回稿"
  );
  assert.equal(buildQuestionTitle("文件大小：2.4 MB\n请检查 Ti-Al 的弹性常数"), "检查 Ti-Al 的弹性常数");
  assert.equal(buildQuestionTitle("1、文件大小：2.4 MB 2、文件名：回稿-Part2-nesting-function.docx"), "Part2 nesting function 回稿");
  assert.equal(buildQuestionTitle("文件大小如何计算"), "文件大小如何计算");
  assert.equal(buildQuestionTitle("请把内存限制为 2 GB"), "把内存限制为 2 GB");
});

test("a real task following a link introduction wins over the document label", () => {
  assert.equal(
    buildQuestionTitle("回稿-Part2-nesting-function\n1、链接中是原稿，请帮我解释 nesting function 的计算方法"),
    "解释 nesting function 的计算方法"
  );
  assert.equal(
    buildQuestionTitle("链接中是代码，请不要覆盖原数据，只修改图例"),
    "不要覆盖原数据，只修改图例"
  );
  assert.equal(buildQuestionTitle("链接中的原始数据不要改，请检查图例"), "链接中的原始数据不要改，请检查图例");
  assert.equal(buildQuestionTitle("回稿-Part2-nesting-function 1、链接中是原稿，不要重算数据，只修改图例"), "不要重算数据，只修改图例");
});

test("file title cleanup preserves model names, chemical hyphens and decimal versions", () => {
  assert.equal(buildQuestionTitle("回稿-MACE-MH-1.pdf 1、链接中是模型报告"), "MACE-MH-1 回稿");
  assert.equal(buildQuestionTitle("回稿-Ti-Al.pdf"), "Ti-Al 回稿");
  assert.equal(buildQuestionTitle("请解释 Python 3.12 的兼容性"), "解释 Python 3.12 的兼容性");
});

test("the actual multiline request outranks document and link preambles", () => {
  assert.equal(
    buildQuestionTitle("附件：回稿-Part2-nesting-function.pdf\nhttps://drive.google.com/file/d/123/view\n请帮我解释 nesting function 的计算方法。"),
    "解释 nesting function 的计算方法"
  );
  assert.equal(
    buildQuestionTitle("以下是我的资料\n1. [研究计划](https://example.com/plan)\n2. 请比较 NM 与 AFM 的光学结果"),
    "比较 NM 与 AFM 的光学结果"
  );
});

test("Markdown and polite openings are removed without changing technical terms", () => {
  assert.equal(buildQuestionTitle("## 你好，请帮我**检查 Ti-Al 的 E-V 曲线**，谢谢。"), "检查 Ti-Al 的 E-V 曲线");
  assert.equal(buildQuestionTitle("Please explain `MACE-MH-1` stress units."), "explain MACE-MH-1 stress units");
  assert.equal(buildQuestionTitle("比较Ti-Al弹性常数"), "比较Ti-Al弹性常数");
  assert.equal(buildQuestionTitle("MACE-MH-1精度"), "MACE-MH-1精度");
});

test("negation remains in the title", () => {
  assert.equal(buildQuestionTitle("请不要重算能量，只调整图例"), "不要重算能量，只调整图例");
  assert.equal(buildQuestionTitle("Could you not overwrite the original data?"), "not overwrite the original data");
});

test("short follow-ups remain recognizable", () => {
  for (const text of ["继续", "不要继续", "好的", "下一步", "重新检查"]) {
    assert.equal(buildQuestionTitle(text), text);
  }
});

test("URL-only and image-only messages have honest fallbacks", () => {
  assert.equal(buildQuestionTitle("https://example.com/a"), "链接相关问题");
  assert.equal(buildQuestionTitle("[https://example.com/a](https://example.com/a)"), "链接相关问题");
  assert.equal(buildQuestionTitle("![对话截图](https://example.com/image.png)"), "图片相关问题");
  assert.equal(buildQuestionTitle("[图片]"), "图片相关问题");
  assert.equal(buildQuestionTitle(" \n ", "第 7 轮"), "第 7 轮");
  assert.equal(buildQuestionTitle(""), "问题");
});

test("a later request is not hidden by a pasted code block", () => {
  assert.equal(buildQuestionTitle("```python\nraise RuntimeError('x')\n```\n请解释这个错误"), "解释这个错误 · RuntimeError");
  assert.equal(buildQuestionTitle("```python\nraise RuntimeError('x')\n```\n请解释 Python 的异常处理"), "解释 Python 的异常处理");
});

test("long Chinese titles stay compact and keep their initial negation", () => {
  const result = buildQuestionTitle("请不要修改已有的计算结果，检查不同磁性状态下的光学电导和介电函数是否使用了相同的展宽参数");
  assert.ok(result.startsWith("不要修改已有的计算结果"));
  assert.ok(Array.from(result).length <= 32);
  assert.ok(result.includes("…"));
  assert.ok(result.endsWith("是否使用了相同的展宽参数"));
});

test("English titles are shortened at word boundaries", () => {
  const result = buildQuestionTitle("Please compare the calculated optical conductivity between the ferromagnetic and nonmagnetic phases");
  assert.equal(result, "compare the calculated optical conductivity…");
  assert.ok(Array.from(result).length <= 48);
});

test("invisible characters and mixed line endings do not pollute titles", () => {
  assert.equal(buildQuestionTitle("\uFEFF文档：资料.pdf\r\n\r\n请\u200B检查\t声子谱"), "检查 声子谱");
});

test("a specific request is extracted from a long same-line background", () => {
  assert.equal(
    buildQuestionTitle("我正在 Windows 11 上整理一个比较复杂的科研数据目录，里面有之前保存的多个文件，请帮我检查 DP-GEN 的训练配置是否合理。"),
    "检查 DP-GEN 的训练配置是否合理"
  );
  assert.equal(
    buildQuestionTitle("我最近正在尝试使用这个软件，但是使用过程中遇到了一些问题，我的问题是：为什么 Python 3.12 导入 numpy 会失败？"),
    "为什么 Python 3.12 导入 numpy 会失败"
  );
  assert.equal(
    buildQuestionTitle("背景：目前我正在使用 PyTorch 训练模型，已经尝试很多不同参数，目标是：把 batch size 从 32 改成 64"),
    "把 batch size 从 32 改成 64"
  );
  assert.equal(buildQuestionTitle("我尝试了好几种设置，你能帮我比较 MACE 和 DP 吗？"), "比较 MACE 和 DP 吗");
  assert.equal(buildQuestionTitle("我现在想知道 DP-GEN 如何恢复训练？"), "DP-GEN 如何恢复训练");
});

test("English sentence boundaries reveal the actual question and preserve versions", () => {
  assert.equal(
    buildQuestionTitle("This is the code from my training run. Could you explain why PyTorch reports CUDA out of memory?"),
    "explain why PyTorch reports CUDA out of memory"
  );
  assert.equal(buildQuestionTitle("I upgraded Python 3.12. Is numpy compatible?"), "Is numpy compatible");
});

test("two short requests retain both intents in their original order", () => {
  assert.equal(buildQuestionTitle("请比较 Ti-Al 的弹性常数；解释 C44 偏低的原因"), "比较 Ti-Al 的弹性常数；解释 C44 偏低的原因");
  assert.equal(buildQuestionTitle("1. 请解释 DP-GEN\n2. 检查 Ti-H 数据"), "解释 DP-GEN；检查 Ti-H 数据");
  assert.equal(buildQuestionTitle("How does MACE work? Compare MACE and DP."), "How does MACE work；Compare MACE and DP");
  assert.equal(buildQuestionTitle("请检查 Ti-H 数据\n请检查 Ti-H 数据"), "检查 Ti-H 数据");
});

test("response-format instructions do not replace the topic", () => {
  assert.equal(buildQuestionTitle("请用中文回答\n请解释 DP-GEN 的探索策略"), "解释 DP-GEN 的探索策略");
  assert.equal(buildQuestionTitle("Please explain MACE.\nPlease answer in English."), "explain MACE");
  assert.equal(buildQuestionTitle("解释 DP-GEN 的训练流程，输出格式：中文列表"), "解释 DP-GEN 的训练流程，输出格式：中文列表");
});

test("code-only and log-only input retain a real diagnostic or declaration", () => {
  assert.equal(buildQuestionTitle("```python\nraise ValueError(\"invalid shape\")\n```"), "ValueError(\"invalid shape\")");
  assert.equal(
    buildQuestionTitle("Traceback (most recent call last):\n  File \"train.py\", line 12\nModuleNotFoundError: No module named numpy"),
    "ModuleNotFoundError: No module named numpy"
  );
  assert.equal(buildQuestionTitle("```python\ndef train_model(config):\n    pass\n```"), "def train_model(config):");
  assert.equal(buildQuestionTitle("~~~js\nthrow new TypeError('bad input')\n~~~"), "TypeError('bad input')");
  assert.equal(buildQuestionTitle("```text\n{}\n```"), "代码相关问题");
  assert.equal(buildQuestionTitle("```python\nraise ValueError('x')"), "ValueError('x')");
});

test("a later technical error identifier survives a long request", () => {
  const result = buildQuestionTitle("请详细分析并解释一下为什么在这个运行环境里导入 numpy 时会出现 ModuleNotFoundError");
  assert.ok(result.startsWith("分析"));
  assert.ok(result.endsWith("ModuleNotFoundError"));
  assert.ok(Array.from(result).length <= 32);
  assert.ok(!result.includes("详细"));
});

test("short follow-up questions keep their own wording without invented context", () => {
  for (const text of ["为什么还是不行？", "那 0.01 eV 呢？", "只改图例", "再解释一下", "What about Python 3.12?", "还有别的方法吗？"]) {
    assert.equal(buildQuestionTitle(text), text.replace(/[？?]$/, ""));
  }
});

test("a conversational plan retains the tools and their actual operations", () => {
  assert.equal(
    buildQuestionTitle("我不一定要求准确，Model-X只是作为初始势函数加速MD来获取基础的数据集结构，在此基础上使用MTP训练新的势函数，会更加准确和快捷"),
    "Model-X加速MD；使用MTP训练新势函数"
  );
  assert.equal(
    buildQuestionTitle("我现在只是在做一个原型，Tool-A只是作为辅助程序加速测试来收集第一批结果，在此基础上使用Tool-B生成新的报告，之后再验证"),
    "Tool-A加速测试；使用Tool-B生成新报告"
  );
});

test("colloquial feasibility questions retain the object and version-change intent", () => {
  assert.equal(
    buildQuestionTitle("比如PPT里面的7-11页的内容，以这些为基础，创造出基础数据集，都使用Model-X是可以的嘛？中间需要更换其他版本嘛？"),
    "基础数据集使用Model-X可行性；更换版本"
  );
  assert.equal(
    buildQuestionTitle("比如文档里的例子，以这些为基础，生成测试报告，都使用Tool-B是可以的嘛？中间需要切换其他版本嘛？"),
    "测试报告使用Tool-B可行性；切换版本"
  );
});

test("a scoped follow-up and a tool-purpose question both survive a long enumeration", () => {
  assert.equal(
    buildQuestionTitle("1、Model-X更擅长于体相结构是吧，那对于复杂结构，比如表面、位错、孪晶、层错、倾转晶界，它应该也能跑出一批初始结构？还是其他模型会更好一些？2、跑模型的时候，里面的ASE Conda这些都是干嘛的"),
    "Model-X对复杂结构能否跑出初始结构；ASE Conda作用"
  );
});

test("negative conversational instructions keep the negated action", () => {
  const result = buildQuestionTitle("比如参考之前的方案，以这些为基础，不需要更换Model-X，而是继续使用Model-Y可以吗？");
  assert.ok(result.includes("不需要更换Model-X"));
  assert.ok(result.includes("Model-Y"));
  assert.equal(buildQuestionTitle("我之前没有安装 Tool-A，现在运行失败，请不要卸载 Tool-B，只检查配置"), "不要卸载 Tool-B，只检查配置");
});

test("word-boundary truncation keeps dotted identifiers and versions intact", () => {
  for (const identifier of ["package.submodule.deep_function", "Library-X-2026.10.5", "GPU-model_2026.10.5"]) {
    const result = buildQuestionTitle(`请检查这个较长说明里提到的运行环境和依赖 ${identifier} 的兼容性与安装方式`);
    assert.ok(result.startsWith("检查 "));
    assert.ok(result.includes(identifier));
    assert.ok(!result.includes("较长说明"));
  }
});
