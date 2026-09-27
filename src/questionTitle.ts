const URL_PATTERN = /(?:https?:\/\/|www\.)[^\s<>\[\]，。；！？]+/gi;
const IMAGE_PATTERN = /!\[[^\]]*\]\([^\n]*?\)|<(?:image|img)\b[^>]*>|\[(?:图片|图像|截图|image|attachment image)\]/gi;
const TASK_START = /^(?:如何|怎么|怎样|为什么|为何|是否|能否|总结|概括|解释|分析|比较|对比|检查|核查|核验|修改|调整|安装|卸载|生成|撰写|写|绘制|画|修复|解决|翻译|润色|提取|整理|读取|查看|评估|计算|设计|实现|创建|打开|列出|查找|搜索|继续|how\b|why\b|what\b|where\b|which\b|explain\b|summari[sz]e\b|compare\b|check\b|review\b|fix\b|install\b|adjust\b|create\b|write\b|translate\b|extract\b|analy[sz]e\b|implement\b)/i;
const POLITE_START = /^(?:请(?:问|你|帮我)?|麻烦(?:你)?|烦请|帮(?:助)?我|能不能(?:帮我)?|可不可以(?:帮我)?|能否(?:帮我)?|我想(?:要)?(?:让你)?|我需要|could you\b|can you\b|would you\b|please\b|help me\b|i (?:want|would like) (?:you )?to\b)/i;
const REFERENCE_START = /^(?:(?:以下|上面|下面|这个|该|所附|上述)?(?:链接|网址|附件|文件|文档)(?:中|里|内|是|为|包含|提供|如下|见)|(?:参考|下载|原文)链接|the (?:link|attachment|document) (?:contains|is|includes)\b)/i;
const NEGATION = /不要|不必|不能|不允许|无需|禁止|不得|\b(?:not|never|without|don't|do not)\b/i;
const ATTACHMENT_METADATA = /^(?:(?:文件大小|文件类型|格式|上传时间|上传者|修改时间|最后修改|file size|file type|uploaded by|last modified)\s*[:：]|(?:已上传|上传成功|下载文件|点击下载|预览文件|uploaded successfully)\s*$|(?:PDF|DOCX?|PPTX?|XLSX?)\s*[|·•]\s*\d|\d+(?:\.\d+)?\s*(?:KB|MB|GB|bytes)\s*$)/i;

function removePolitePrefix(value: string): string {
  let result = value
    .replace(/^(?:(?:你好|您好|嗨|hello|hi)[，,！!。.:：\s]+)+/i, "")
    .replace(/[，,。.!！\s]*(?:谢谢(?:你)?|感谢|thank you|thanks)[。.!！\s]*$/i, "");
  for (let count = 0; count < 4; count += 1) {
    const next = result.replace(POLITE_START, "").replace(/^[，,:：\s]+/, "");
    if (!next || next === result) break;
    result = next;
  }
  return result.trim();
}

function cleanLine(value: string): string {
  const hasAttachmentMetadata = /\.(?:pdf|docx?|pptx?|xlsx?|png|jpe?g|webp)(?=\s|[（(]|$)|^\s*(?:附件|文件名(?:称)?|filename|file name)\s*[:：]/i.test(value);
  return value
    .replace(/^\s*(?:#{1,6}\s*|>\s*|[-*+]\s+|(?:\d+|[一二三四五六七八九十]+)[.)、．）]\s*|[（(]\d+[)）]\s*)/, "")
    .replace(/\[([^\]]+)\]\([^\n]*?\)/g, "$1")
    .replace(URL_PATTERN, " ")
    .replace(/\*\*|__|~~|`/g, "")
    .replace(/^\s*(?:(?:附件|文件|文档)(?:名(?:称)?)?|链接|图片|截图|filename|file name)\s*[:：]\s*/i, "")
    .replace(/\[(?:附件|文件|attachment|file)\]/gi, " ")
    .replace(/\.(?:pdf|docx?|pptx?|xlsx?|png|jpe?g|webp)(?=\s|\(|（|$)/gi, "")
    .replace(/\s*(?:[（(]\s*)?(?:(?:PDF|DOCX?|PPTX?|XLSX?)\s*[,，|·•]\s*)?\d+(?:\.\d+)?\s*(?:KB|MB|GB|bytes)\s*[)）]?\s*(?:[|·•]\s*已上传)?$/i, (metadata) => hasAttachmentMetadata ? "" : metadata)
    .replace(/[\t\u00a0 ]+/g, " ")
    .replace(/^[\s:：,，;；.。!?！？()[\]<>]+|[\s:：,，;；.。!?！？()[\]<>]+$/g, "")
    .trim();
}

function selectReferenceRequest(value: string): string {
  if (!REFERENCE_START.test(value)) return value;
  const boundary = /[，,；;]\s*(?=(?:请|麻烦|烦请|帮我|能否|如何|怎么|比较|检查|解释|分析|不要|please\b|could you\b|can you\b))/i.exec(value);
  // 只剥离纯链接说明，不能把前置的“不改数据”等约束一起删掉。
  if (!boundary || NEGATION.test(value.slice(0, boundary.index))) return value;
  return value.slice(boundary.index + boundary[0].length);
}

function formatDocumentTitle(value: string): string {
  const match = /^([\p{Script=Han}\p{N}]+)[-_]([^，,。；;！？!?]+)$/u.exec(value);
  if (!match) return value;
  const [, label, originalTopic] = match;
  const topic = originalTopic
    .replace(/\b(Part\s*\d+)[-_]+/gi, "$1 ")
    .replace(/([a-z])[-_](?=[a-z])/g, "$1 ")
    .trim();
  // 调整明确的文档类别词位置；技术词本身不翻译、不改大小写。
  return /^(?:回稿|修稿|修订稿|修改稿|审稿回复)$/.test(label)
    ? `${topic} ${label}`
    : `${label} ${topic}`;
}

function compactTitle(value: string): string {
  const hasChinese = /\p{Script=Han}/u.test(value);
  const limit = hasChinese ? 32 : 48;
  const characters = Array.from(value);
  if (characters.length <= limit) return value;

  const prefix = characters.slice(0, limit - 1).join("");
  const nextCharacter = characters[limit - 1];
  // 中文可在字间收束；英文和技术标识符在词边界收束。
  const latinWord = /[\p{Script=Latin}\p{N}_-]/u;
  let shortened = prefix;
  if (latinWord.test(prefix.slice(-1)) && latinWord.test(nextCharacter)) {
    shortened = prefix.replace(/[\p{Script=Latin}\p{N}_-]+$/u, "");
  }
  shortened = shortened.replace(/[\s,，;；:：、.。-]+$/, "");
  // 单个长标识符没有安全词界，保留完整名称，避免生成错误技术名。
  if (!shortened) return value.split(/\s/)[0];
  return `${shortened}…`;
}

/** 仅从原问题抽取本地短标题，不调用模型或生成原文没有的主题。 */
export function buildQuestionTitle(text: string, fallback?: string): string {
  const raw = text.replace(/[\u200B-\u200D\uFEFF]/g, "").replace(/\r\n?/g, "\n");
  const hasUrl = /(?:https?:\/\/|www\.)/i.test(raw);
  const hasImage = /!\[[^\]]*\]\(|<(?:image|img)\b|\[(?:图片|图像|截图|image|attachment image)\]/i.test(raw);
  const cleaned = raw
    .replace(IMAGE_PATTERN, " ")
    .replace(/```[^\n]*\n[\s\S]*?(?:```|$)/g, " ")
    // DOM 提取有时会把“文件标题 + 编号请求”压成同一行。
    .replace(/[\t ]+(?=(?:\d{1,2}[、．）)]|\d{1,2}\.(?=\s)|[（(]\d{1,2}[)）]|[一二三四五六七八九十]+[、．）]))/gu, "\n");
  const candidates = cleaned.split(/\n|[。！？!?](?=\s|[\p{Script=Han}]|$)/u)
    .map((line, index) => {
      const plain = selectReferenceRequest(cleanLine(line));
      const title = removePolitePrefix(plain);
      const hasNegation = NEGATION.test(title);
      const score = (POLITE_START.test(plain) ? 12 : 0) + (TASK_START.test(title) ? 8 : 0)
        + (hasNegation ? 4 : 0) - (REFERENCE_START.test(title) && !hasNegation ? 6 : 0);
      return { title, score, index, metadata: ATTACHMENT_METADATA.test(plain) || ATTACHMENT_METADATA.test(line.trim()) };
    })
    .filter(({ title, metadata }) => !metadata && title && !/^(?:附件|文件|文档|链接|图片|截图|attachment|file|image)$/i.test(title));

  if (candidates.length === 0) {
    return compactTitle(fallback?.trim() || (hasImage ? "图片相关问题" : hasUrl ? "链接相关问题" : "问题"));
  }

  const selected = candidates.sort((left, right) => right.score - left.score || left.index - right.index)[0];
  let title = selected.title;
  if (selected.score === 0) {
    title = formatDocumentTitle(title);
  }
  return compactTitle(title);
}
