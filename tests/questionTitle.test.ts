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
  assert.equal(buildQuestionTitle("```python\nraise RuntimeError('x')\n```\n请解释这个错误"), "解释这个错误");
});

test("long Chinese titles stay compact and keep their initial negation", () => {
  const result = buildQuestionTitle("请不要修改已有的计算结果，检查不同磁性状态下的光学电导和介电函数是否使用了相同的展宽参数");
  assert.ok(result.startsWith("不要修改已有的计算结果"));
  assert.ok(Array.from(result).length <= 32);
  assert.ok(result.endsWith("…"));
});

test("English titles are shortened at word boundaries", () => {
  const result = buildQuestionTitle("Please compare the calculated optical conductivity between the ferromagnetic and nonmagnetic phases");
  assert.equal(result, "compare the calculated optical conductivity…");
  assert.ok(Array.from(result).length <= 48);
});

test("invisible characters and mixed line endings do not pollute titles", () => {
  assert.equal(buildQuestionTitle("\uFEFF文档：资料.pdf\r\n\r\n请\u200B检查\t声子谱"), "检查 声子谱");
});
