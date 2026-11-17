const URL_PATTERN = /(?:https?:\/\/|www\.)[^\s<>\[\]，。；！？]+/gi;
const IMAGE_PATTERN = /!\[[^\]]*\]\([^\n]*?\)|<(?:image|img)\b[^>]*>|\[(?:图片|图像|截图|image|attachment image)\]/gi;
const TASK_START = /^(?:如何|怎么|怎样|为什么|为何|是否|能否|总结|概括|解释|分析|比较|对比|检查|核查|核验|修改|调整|安装|卸载|生成|撰写|写|绘制|画|修复|解决|翻译|润色|提取|整理|读取|查看|评估|计算|设计|实现|创建|打开|列出|查找|搜索|继续|how\b|why\b|what\b|where\b|which\b|explain\b|summari[sz]e\b|compare\b|check\b|review\b|fix\b|install\b|adjust\b|create\b|write\b|translate\b|extract\b|analy[sz]e\b|implement\b)/i;
const POLITE_START = /^(?:请(?:问|你|帮我|帮忙)?|麻烦(?:你)?|烦请|帮(?:助)?我|帮忙|(?:你)?(?:能不能|可不可以|能否)(?:帮我)?|你(?:能|可以)(?:帮我|告诉我)?|(?:能|可以)(?:帮我|告诉我)|我(?:现在)?想(?:要)?(?:让你|知道|了解)?|我需要|希望你(?:能)?|could you\b|can you\b|would you\b|please\b|help me\b|i (?:want|would like) (?:you )?to\b)/i;
const REFERENCE_START = /^(?:(?:以下|上面|下面|这个|该|所附|上述)?(?:链接|网址|附件|文件|文档)(?:中|里|内|是|为|包含|提供|如下|见)|(?:参考|下载|原文)链接|the (?:link|attachment|document) (?:contains|is|includes)\b)/i;
const NEGATION = /不要|不必|不能|不允许|不(?:需要|再|应|可以|支持|建议|使用|修改|安装|删除|覆盖|训练|运行|生成|计算)|无需|禁止|不得|\b(?:not|never|without|don't|do not)\b/i;
const ATTACHMENT_METADATA = /^(?:(?:文件大小|文件类型|格式|上传时间|上传者|修改时间|最后修改|file size|file type|uploaded by|last modified)\s*[:：]|(?:已上传|上传成功|下载文件|点击下载|预览文件|uploaded successfully)\s*$|(?:PDF|DOCX?|PPTX?|XLSX?)\s*[|·•]\s*\d|\d+(?:\.\d+)?\s*(?:KB|MB|GB|bytes)\s*$)/i;
const QUESTION = /如何|怎么|怎样|为什么|为何|是否|能否|有什么|是什么|在哪|区别|原因|[吗嘛么]|干嘛|干什么|是吧|\b(?:how|why|what|where|which)\b|^(?:is|are|does|do|can|will|could)\b/i;
const OUTPUT_INSTRUCTION = /^(?:请)?(?:用(?:中文|英文|中英文)|使用(?:中文|英文)|回答(?:时|请)|输出(?:格式|要求)|格式要求|注意事项|要求[:：]|answer in\b|respond in\b|output format\b)/i;
const ERROR_NAME = /\b(?:[\w.]*(?:Error|Exception)|ERR_[A-Z_]+|E[A-Z]{3,}(?=\b))\b/;
const ERROR_LINE = /\b(?:[\w.]*(?:Error|Exception)|ERR_[A-Z_]+|E[A-Z]{3,})\b|^\s*(?:ERROR|FATAL)\s*[:\[]/;

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

function selectMainRequest(value: string): string {
  const referenceRequest = selectReferenceRequest(value);
  if (referenceRequest !== value) return referenceRequest;
  // 背景与请求压在同一句时，从明确的请求标记抽取，保留前置否定约束。
  const request = /(?:[，,；;：:]\s*|^)(?:(?:我的)?(?:问题|需求|目标)是[:：]?\s*|(?=(?:请|麻烦|烦请|帮我|希望你|你(?:能|可以)|能不能|可不可以|能否|could you\b|can you\b|please\b)))/i.exec(value);
  if (!request || NEGATION.test(value.slice(0, request.index))) return value;
  return value.slice(request.index + request[0].length);
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

function compactTitle(value: string, maximum?: number): string {
  const hasChinese = /\p{Script=Han}/u.test(value);
  const limit = maximum ?? (hasChinese ? 32 : 48);
  const characters = Array.from(value);
  if (characters.length <= limit) return value;

  const prefix = characters.slice(0, limit - 1).join("");
  const nextCharacter = characters[limit - 1];
  // 中文可在字间收束；英文和技术标识符在词边界收束。
  const latinWord = /[\p{Script=Latin}\p{N}_.+/-]/u;
  let shortened = prefix;
  if (latinWord.test(prefix.slice(-1)) && latinWord.test(nextCharacter)) {
    shortened = prefix.replace(/[\p{Script=Latin}\p{N}_.+/-]+$/u, "");
  }
  shortened = shortened.replace(/[\s,，;；:：、.。-]+$/, "");
  // 单个长标识符没有安全词界，保留完整名称，避免生成错误技术名。
  if (!shortened) return value.split(/\s/)[0];
  return `${shortened}…`;
}

function summarizeRequest(value: string): string {
  const limit = /\p{Script=Han}/u.test(value) ? 32 : 48;
  if (Array.from(value).length <= limit) return value;
  const clauses = value.split(/[，,；;]\s*/);
  // 长请求中的说明、背景和输出格式不挤占真正的操作与对象。
  const tasks = clauses.filter((clause) => {
    const title = removePolitePrefix(clause);
    return (TASK_START.test(title) || QUESTION.test(title) || NEGATION.test(title))
      && !OUTPUT_INSTRUCTION.test(title);
  });
  let summary = tasks.length > 0 ? tasks.map(removePolitePrefix).join("，") : value;
  if (Array.from(summary).length <= limit) return summary;

  summary = summary
    .replace(/^(?:详细地?|仔细地?|认真地?|全面地?|简单地?)\s*(?=解释|分析|比较|检查|总结|介绍)/, "")
    .replace(/\b(?:in detail|step by step)\b/gi, "")
    .replace(/\s+/g, " ").trim();
  if (Array.from(summary).length <= limit) return summary;

  const action = TASK_START.exec(summary)?.[0];
  const identifiers = Array.from(summary.matchAll(/[A-Za-z][A-Za-z0-9_.+/-]*/g))
    .filter((match) => /[A-Z\d_.+/-]/.test(match[0]));
  const identifier = identifiers.sort((left, right) => right[0].length - left[0].length)[0];
  if (action && identifier && identifier.index > action.length + 2 && !NEGATION.test(summary)) {
    const label = `${action} ${identifier[0]}`;
    if (Array.from(label).length >= limit) return label;
    const object = `${identifier[0]}${summary.slice(identifier.index + identifier[0].length)}`;
    return compactTitle(`${action} ${object}`);
  }

  // 后置疑问和数值往往包含区分问题的关键信息，不能总是只截取开头。
  const tail = /(?:是否|能否|为什么|如何|怎么|怎样|\b(?:why|how|whether)\b)[^，,；;]*$/i.exec(summary);
  const numericTail = /(?:\b\d+(?:\.\d+)?\s*[a-zA-Z%]+[^，,；;]*|\d+(?:\.\d+)?\s*(?:倍|个|次|度|秒|分钟|小时))$/u.exec(summary);
  const technicalTail = /(?:[A-Za-z][\w.-]*(?:Error|Exception)|[A-Za-z][\w.-]*[-_][\w.-]+)\s*$/u.exec(summary);
  const ending = technicalTail ?? tail ?? numericTail;
  if (ending && ending.index > 6 && Array.from(ending[0]).length <= limit - 8) {
    return `${compactTitle(summary.slice(0, ending.index), limit - Array.from(ending[0]).length)}${ending[0]}`;
  }
  return compactTitle(summary);
}

function selectCodeTopic(blocks: string[]): string {
  const lines = blocks.flatMap((block) => block.split("\n")).map((line) => line.trim()).filter(Boolean);
  const error = [...lines].reverse().find((line) => ERROR_LINE.test(line));
  if (error) return error.replace(/^\s*(?:raise|throw(?: new)?)\s+/, "").trim();
  const declaration = lines.find((line) => /^(?:(?:export|async|public|private|static)\s+)*(?:def|class|function|const|let|var|import)\b/.test(line));
  return declaration ?? "";
}

function summarizeNarrative(value: string): string | undefined {
  if (!/\p{Script=Han}/u.test(value) || NEGATION.test(value)) return undefined;
  const clauses = value.split(/\n|[，,。！？!?；;]/u).map(cleanLine).filter(Boolean);
  if (clauses.length < 3) return undefined;
  const summaries: string[] = [];
  let subject = "";
  let createdObject = "";
  let scope = "";
  for (const clause of clauses) {
    if (/^(?:比如|例如|以这些|以此|以下|上面|下面)/.test(clause)) continue;
    const topic = /^(?:那)?(?:对于|针对|关于)(.+)$/.exec(clause);
    if (topic) {
      scope = topic[1];
      continue;
    }
    const technicalSubject = /[A-Za-z][\w.+-]*(?:\s+[A-Za-z][\w.+-]*)*/.exec(clause)?.[0];
    if (technicalSubject) subject = technicalSubject;
    if (/(?:干嘛|干什么|做什么|什么用|什么作用)/.test(clause)) {
      if (technicalSubject) summaries.push(`${technicalSubject}作用`);
      continue;
    }
    const action = /加速|获取|收集|采集|训练|生成|创造|构建|创建|更换|切换|替换|安装|卸载|运行|使用|修改|检查|分析|比较|解释|计算|修复|恢复|转换|导出|导入|优化|跑出|跑/.exec(clause);
    if (!action || /的时候\s*$/.test(clause)) continue;
    // 否定和未完成状态需要完整语境，保守沿用常规请求提取。
    if (/(?:不|没|未|无)(?!同)/.test(clause.slice(0, action.index))) return undefined;
    let request = clause.slice(action.index)
      .split(/来(?=获取|生成|收集|采集)|以便|从而|这样就/)[0]
      .replace(/(?:是)?可以的?[吗嘛么]$/, "可行性")
      .replace(/需要(?=更换|切换|替换)/g, "")
      .replace(/[吗嘛么]$/, "")
      .replace(/其他(?=版本|模型|方法)/g, "")
      .replace(/一批|一些/g, "")
      .replace(/([\p{Script=Han}])的(?=[\p{Script=Han}])/gu, "$1");
    const prefix = clause.slice(0, action.index);
    if (technicalSubject && prefix.includes(technicalSubject)) request = `${technicalSubject}${request}`;
    else if (/^(?:它|该|这个|这些)/.test(prefix) && subject) {
      const isQuestion = value.includes(`${clause}？`) || value.includes(`${clause}?`);
      const modality = /能/.test(prefix) ? (isQuestion ? "能否" : "能") : "";
      request = `${subject}${scope ? `对${scope}` : ""}${modality}${request}`;
    }
    // 连续的“创建对象、使用某工具”合成一项，避免目录只留下工具名。
    if (createdObject && /^使用/.test(request)) {
      summaries.pop();
      request = `${createdObject}${request}`;
    }
    createdObject = /^(?:生成|创造|构建|创建)/.test(request)
      ? request.replace(/^(?:生成|创造|构建|创建)出?/, "") : "";
    if (!summaries.includes(request)) summaries.push(request);
  }
  if (summaries.length === 0) return undefined;
  // 两个主题共用紧凑标题，技术标识符始终按完整词保留。
  const chosen = summaries.slice(0, 2);
  const combined = chosen.join("；");
  if (Array.from(combined).length <= 40) return combined;
  return chosen.map((title) => compactTitle(title, 19)).join("；");
}

/** 仅从原问题抽取本地短标题，不调用模型或生成原文没有的主题。 */
export function buildQuestionTitle(text: string, fallback?: string): string {
  const raw = text.replace(/[\u200B-\u200D\uFEFF]/g, "").replace(/\r\n?/g, "\n");
  const hasUrl = /(?:https?:\/\/|www\.)/i.test(raw);
  const hasImage = /!\[[^\]]*\]\(|<(?:image|img)\b|\[(?:图片|图像|截图|image|attachment image)\]/i.test(raw);
  const codeBlocks: string[] = [];
  const cleaned = raw
    .replace(IMAGE_PATTERN, " ")
    .replace(/(?:```|~~~)[^\n]*\n([\s\S]*?)(?:```|~~~|$)/g, (_, block: string) => {
      codeBlocks.push(block);
      return "\n";
    })
    // DOM 提取有时会把“文件标题 + 编号请求”压成同一行。
    .replace(/[\t ]+(?=(?:\d{1,2}[、．）)]|\d{1,2}\.(?=\s)|[（(]\d{1,2}[)）]|[一二三四五六七八九十]+[、．）]))/gu, "\n");
  const candidates = cleaned.replace(/\.(?=\s+[A-Z])/g, "\n")
    .split(/\n|[。！？!?](?=\s|[\p{Script=Han}]|\d+[、.)）]|$)|[；;](?=\s*(?:请|如何|为什么|解释|比较|检查|修复|翻译|总结|how\b|why\b|explain\b|compare\b|fix\b))/iu)
    .map((line, index) => {
      const cleanedLine = cleanLine(line);
      const plain = selectMainRequest(cleanedLine);
      const title = removePolitePrefix(plain);
      const hasNegation = NEGATION.test(title);
      const score = (POLITE_START.test(plain) ? 12 : 0) + (TASK_START.test(title) ? 8 : 0)
        + (hasNegation ? 4 : 0) + (QUESTION.test(title) ? 8 : 0)
        - (REFERENCE_START.test(title) && !hasNegation ? 6 : 0)
        - (OUTPUT_INSTRUCTION.test(title) ? 24 : 0)
        - (/^(?:Traceback\b|File ["']|at\s+\S+\s*\(|\d{2}:\d{2}:\d{2}\b)/i.test(title) ? 16 : 0);
      return { title, score, index, explicitRequest: plain !== cleanedLine || POLITE_START.test(plain),
        metadata: ATTACHMENT_METADATA.test(plain) || ATTACHMENT_METADATA.test(line.trim()) };
    })
    .filter(({ title, metadata }) => !metadata && title && !/^(?:附件|文件|文档|链接|图片|截图|attachment|file|image)$/i.test(title));

  if (candidates.length === 0) {
    const codeTopic = selectCodeTopic(codeBlocks);
    return compactTitle(codeTopic || fallback?.trim() || (hasImage ? "图片相关问题" : hasUrl ? "链接相关问题" : codeBlocks.length ? "代码相关问题" : "问题"));
  }

  const selected = candidates.sort((left, right) => right.score - left.score || left.index - right.index)[0];
  if (!candidates.some((candidate) => candidate.explicitRequest || TASK_START.test(candidate.title))) {
    const narrative = summarizeNarrative(cleaned);
    if (narrative) return narrative;
  }
  let title = selected.title;
  if (selected.score < 8) {
    const errorTopic = selectCodeTopic([cleaned, ...codeBlocks]);
    if (errorTopic && ERROR_LINE.test(errorTopic)) return compactTitle(errorTopic);
  }
  if (selected.score === 0) {
    title = formatDocumentTitle(title);
  }
  const otherTask = candidates.find((candidate) => candidate.index !== selected.index && candidate.score >= 8
    && !NEGATION.test(title) && !NEGATION.test(candidate.title)
    && candidate.title !== title && !OUTPUT_INSTRUCTION.test(candidate.title));
  if (otherTask) {
    const ordered = [selected, otherTask].sort((left, right) => left.index - right.index);
    const combined = ordered.map((candidate) => candidate.title).join("；");
    if (Array.from(combined).length <= (/\p{Script=Han}/u.test(combined) ? 32 : 48)) return combined;
  }
  const errorName = selectCodeTopic(codeBlocks).match(ERROR_NAME)?.[0];
  if (errorName && /^(?:解释|分析|修复|解决)?(?:一下)?(?:这个|该|上述)?(?:报错|错误|问题)$|^(?:explain|fix|debug) (?:this|the) (?:error|issue)$/i.test(title)) {
    title = `${title} · ${errorName}`;
  }
  return summarizeRequest(title);
}
