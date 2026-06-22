from __future__ import annotations

import os
import shutil
import sys
from pathlib import Path

try:
    from PIL import Image
    from reportlab.lib import colors
    from reportlab.lib.enums import TA_CENTER, TA_LEFT
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import cm, mm
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    from reportlab.platypus import (
        Flowable,
        Image as RLImage,
        KeepTogether,
        ListFlowable,
        ListItem,
        PageBreak,
        Paragraph,
        SimpleDocTemplate,
        Spacer,
        Table,
        TableStyle,
    )
except ModuleNotFoundError as exc:
    missing = exc.name or "dependency"
    print(
        f"[build-product-manual] missing python package: {missing}\n"
        "Install with: python3 -m pip install reportlab pillow",
        file=sys.stderr,
    )
    raise SystemExit(1)

ROOT = Path(__file__).resolve().parents[2]
OUT_DIR = ROOT / "output" / "pdf"
SCREENSHOT_DIR = ROOT / "docs" / "assets" / "screenshots"
PDF_PATH = OUT_DIR / "AI用例平台-产品使用手册.pdf"
MANUAL_SCREENSHOT = SCREENSHOT_DIR / "product-manual-ai-analysis.png"
OPTIONAL_SOURCE_SCREENSHOT = os.getenv("MANUAL_SCREENSHOT_SOURCE")

def register_fonts() -> tuple[str, str]:
    candidates = [
        Path("/System/Library/Fonts/Supplemental/Arial Unicode.ttf"),
        Path("/System/Library/Fonts/STHeiti Medium.ttc"),
    ]
    for candidate in candidates:
        if candidate.exists():
            pdfmetrics.registerFont(TTFont("ManualCJK", str(candidate)))
            return "ManualCJK", "ManualCJK"
    return "Helvetica", "Helvetica-Bold"


FONT, FONT_BOLD_NAME = register_fonts()


def ensure_assets() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    SCREENSHOT_DIR.mkdir(parents=True, exist_ok=True)
    if OPTIONAL_SOURCE_SCREENSHOT:
        source = Path(OPTIONAL_SOURCE_SCREENSHOT).expanduser()
        if source.exists():
            shutil.copy2(source, MANUAL_SCREENSHOT)


class WorkflowStrip(Flowable):
    def __init__(self, labels: list[str], width: float = 480, height: float = 78):
        super().__init__()
        self.labels = labels
        self.width = width
        self.height = height

    def draw(self):
        c = self.canv
        count = len(self.labels)
        gap = 8
        box_w = (self.width - gap * (count - 1)) / count
        y = 18
        for i, label in enumerate(self.labels):
            x = i * (box_w + gap)
            c.setFillColor(colors.HexColor("#EFF6FF"))
            c.setStrokeColor(colors.HexColor("#2563EB"))
            c.roundRect(x, y, box_w, 40, 8, stroke=1, fill=1)
            c.setFillColor(colors.HexColor("#1D4ED8"))
            c.setFont(FONT_BOLD_NAME, 8)
            c.drawCentredString(x + box_w / 2, y + 24, label)
            c.setFillColor(colors.HexColor("#64748B"))
            c.setFont(FONT, 7)
            c.drawCentredString(x + box_w / 2, y + 12, f"Step {i + 1}")
            if i < count - 1:
                c.setStrokeColor(colors.HexColor("#94A3B8"))
                ax = x + box_w + 1
                ay = y + 20
                c.line(ax, ay, ax + gap - 2, ay)
                c.line(ax + gap - 5, ay + 3, ax + gap - 2, ay)
                c.line(ax + gap - 5, ay - 3, ax + gap - 2, ay)


class ModuleMap(Flowable):
    def __init__(self, width: float = 480, height: float = 155):
        super().__init__()
        self.width = width
        self.height = height

    def draw_box(self, x, y, w, h, title, subtitle, fill, stroke):
        c = self.canv
        c.setFillColor(colors.HexColor(fill))
        c.setStrokeColor(colors.HexColor(stroke))
        c.roundRect(x, y, w, h, 7, stroke=1, fill=1)
        c.setFillColor(colors.HexColor("#0F172A"))
        c.setFont(FONT_BOLD_NAME, 8)
        c.drawString(x + 8, y + h - 14, title)
        c.setFillColor(colors.HexColor("#475569"))
        c.setFont(FONT, 6.6)
        for idx, line in enumerate(subtitle.split("\n")[:3]):
            c.drawString(x + 8, y + h - 27 - idx * 9, line)

    def draw(self):
        c = self.canv
        boxes = [
            (0, 92, 142, 54, "AI 需求分析", "PDF/图片/文本上传\n结构化报告与评分\nREQ/TP 追踪", "#ECFEFF", "#06B6D4"),
            (169, 92, 142, 54, "生成用例", "按模板生成测试用例\n质量修复与分页展示\n导出/进入评审", "#F5F3FF", "#8B5CF6"),
            (338, 92, 142, 54, "用例评审", "结构化编辑\n评论与版本 diff\n覆盖矩阵", "#F0FDF4", "#22C55E"),
            (0, 16, 142, 54, "文件解析/OCR", "PDF 文本层\nOCR/多模态\nRedis 实时进度", "#FFF7ED", "#F97316"),
            (169, 16, 142, 54, "模板/模型管理", "提示词模板\n模型连通性\nToken/视觉配置", "#F8FAFC", "#64748B"),
            (338, 16, 142, 54, "记录与导出", "生成记录\n分享/下载\n审计追溯", "#FEF2F2", "#EF4444"),
        ]
        for box in boxes:
            self.draw_box(*box)
        c.setStrokeColor(colors.HexColor("#CBD5E1"))
        c.line(142, 119, 169, 119)
        c.line(311, 119, 338, 119)
        c.line(71, 92, 71, 70)
        c.line(240, 92, 240, 70)
        c.line(409, 92, 409, 70)


def p(text: str, style: ParagraphStyle) -> Paragraph:
    return Paragraph(text.replace("\n", "<br/>"), style)


def bullet(items: list[str], style: ParagraphStyle) -> ListFlowable:
    return ListFlowable(
        [ListItem(p(item, style), leftIndent=10) for item in items],
        bulletType="bullet",
        start="circle",
        leftIndent=14,
        bulletFontName=FONT,
        bulletFontSize=7,
    )


def scaled_image(path: Path, max_width: float, max_height: float) -> RLImage | None:
    if not path.exists():
        return None
    with Image.open(path) as img:
        w, h = img.size
    ratio = min(max_width / w, max_height / h)
    return RLImage(str(path), width=w * ratio, height=h * ratio)


def table(data, widths, header=True):
    cell_style = ParagraphStyle(
        "TableCell",
        fontName=FONT,
        fontSize=8,
        leading=11,
        textColor=colors.HexColor("#1E293B"),
        wordWrap="CJK",
    )
    header_style = ParagraphStyle(
        "TableHeader",
        fontName=FONT_BOLD_NAME,
        fontSize=8,
        leading=11,
        textColor=colors.white,
        wordWrap="CJK",
    )
    normalized = []
    for r_idx, row in enumerate(data):
      normalized.append([
          Paragraph(str(cell), header_style if header and r_idx == 0 else cell_style)
          for cell in row
      ])
    t = Table(normalized, colWidths=widths, hAlign="LEFT", repeatRows=1 if header else 0)
    style = [
        ("FONTNAME", (0, 0), (-1, -1), FONT),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("LEADING", (0, 0), (-1, -1), 11),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#CBD5E1")),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]
    if header:
        style.extend(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0F172A")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), FONT_BOLD_NAME),
            ]
        )
    t.setStyle(TableStyle(style))
    return t


def build_story():
    styles = getSampleStyleSheet()
    styles.add(
        ParagraphStyle(
            "CoverTitle",
            fontName=FONT_BOLD_NAME,
            fontSize=28,
            leading=36,
            alignment=TA_CENTER,
            textColor=colors.HexColor("#0F172A"),
            spaceAfter=12,
        )
    )
    styles.add(
        ParagraphStyle(
            "CoverSub",
            fontName=FONT,
            fontSize=12,
            leading=18,
            alignment=TA_CENTER,
            textColor=colors.HexColor("#475569"),
        )
    )
    styles.add(
        ParagraphStyle(
            "H1",
            fontName=FONT_BOLD_NAME,
            fontSize=17,
            leading=23,
            textColor=colors.HexColor("#0F172A"),
            spaceBefore=8,
            spaceAfter=8,
        )
    )
    styles.add(
        ParagraphStyle(
            "H2",
            fontName=FONT_BOLD_NAME,
            fontSize=12,
            leading=17,
            textColor=colors.HexColor("#1D4ED8"),
            spaceBefore=8,
            spaceAfter=5,
        )
    )
    styles.add(
        ParagraphStyle(
            "BodyCN",
            fontName=FONT,
            fontSize=9,
            leading=14,
            textColor=colors.HexColor("#1E293B"),
            spaceAfter=5,
            alignment=TA_LEFT,
        )
    )
    styles.add(
        ParagraphStyle(
            "Small",
            fontName=FONT,
            fontSize=7.5,
            leading=11,
            textColor=colors.HexColor("#64748B"),
            spaceAfter=4,
        )
    )
    styles.add(
        ParagraphStyle(
            "Callout",
            fontName=FONT,
            fontSize=9,
            leading=14,
            textColor=colors.HexColor("#0F172A"),
            borderColor=colors.HexColor("#93C5FD"),
            borderWidth=0.6,
            borderPadding=8,
            backColor=colors.HexColor("#EFF6FF"),
            spaceBefore=6,
            spaceAfter=8,
        )
    )

    story = []
    story += [
        Spacer(1, 25 * mm),
        p("AI 用例平台<br/>产品使用手册", styles["CoverTitle"]),
        p("需求分析、用例生成、评审闭环与自动化测试提效指南", styles["CoverSub"]),
        Spacer(1, 10 * mm),
        ModuleMap(),
        Spacer(1, 8 * mm),
        p(
            "适用对象：个人提效用户、测试工程师、产品/研发协同人员。<br/>"
            "版本：develop/main 当前功能集；更新时间：2026-06-18。",
            styles["Callout"],
        ),
        PageBreak(),
    ]

    story += [
        p("1. 平台定位与核心价值", styles["H1"]),
        p(
            "AI 用例平台面向需求文档解析、AI 需求分析、测试用例生成、用例评审和交付追踪。"
            "平台重点解决三类问题：把 PDF/图片/文本需求快速转成结构化分析；让 AI 生成的用例可审阅、可追踪、可导出；"
            "为后续自动执行和结果回写保留 REQ-ID、TP-ID、覆盖矩阵等基础数据。",
            styles["BodyCN"],
        ),
        p("推荐主流程", styles["H2"]),
        WorkflowStrip(["上传需求", "解析/OCR", "AI 分析", "人工审阅", "生成用例", "评审回写"]),
        p("核心能力速览", styles["H2"]),
        table(
            [
                ["模块", "解决的问题", "关键产物"],
                ["AI 需求分析", "把需求文档归纳成可测试结构，识别歧义、风险和流程路径。", "结构化报告、评分、待确认问题、REQ/TP"],
                ["生成用例", "按模板和模型生成可执行测试用例，并自动做质量修复。", "测试用例、用例集、质量报告"],
                ["用例评审", "对 AI 输出进行人工确认、评论、版本对比和执行结果导入。", "评审状态、评论、版本、覆盖矩阵"],
                ["文件解析/OCR", "解析 PDF、图片、Word、Excel、文本等输入，降低手工整理成本。", "解析文本、结构化需求、流程图摘要"],
                ["模板/模型管理", "管理提示词模板、模型连接、视觉模型和 Token 参数。", "可复用模板、默认模型、连通性结果"],
            ],
            [2.6 * cm, 8 * cm, 5.4 * cm],
        ),
        PageBreak(),
    ]

    story += [
        p("2. 界面总览", styles["H1"]),
        p(
            "左侧为主导航，包含工作台、AI 需求分析、生成用例、生成记录、用例评审、模板管理、团队管理、用量统计和系统设置。"
            "顶部展示模型、提示、天气和账号入口。中间区域按当前模块展示表单、历史、结果和操作按钮。",
            styles["BodyCN"],
        ),
    ]
    img = scaled_image(MANUAL_SCREENSHOT, 16 * cm, 7.7 * cm)
    if img:
        story += [img, p("图 1：AI 需求分析页面示例，包含左侧配置区、历史记录、右侧终端和人工审阅区。", styles["Small"])]
    else:
        story += [p("截图缺失：请将页面截图放入 docs/assets/screenshots/product-manual-ai-analysis.png。", styles["Callout"])]
    story += [
        p("页面区域说明", styles["H2"]),
        table(
            [
                ["区域", "说明", "常用操作"],
                ["左侧导航", "切换工作台、需求分析、生成、记录、评审、模板和设置。", "进入指定模块、返回工作台"],
                ["输入配置区", "上传文档、选择分析模板、编辑需求正文和补充说明。", "上传 PDF、展开编辑、恢复默认模板"],
                ["历史区", "展示近期分析记录和最近上传文件。", "载入历史、删除记录、查看全部"],
                ["结果区", "展示流式过程、报告、复制、打印、PDF 和 XMind 导出。", "查看报告、导出、生成用例"],
                ["底部控制区", "人工审阅开关、开始/停止按钮。", "启停人工审阅、发起分析、停止任务"],
            ],
            [3 * cm, 7.3 * cm, 5.7 * cm],
        ),
        PageBreak(),
    ]

    story += [
        p("3. AI 需求分析操作指南", styles["H1"]),
        p("适合输入 PRD、交互流程图 PDF、活动规则、接口说明、截图或纯文本需求。", styles["BodyCN"]),
        p("操作步骤", styles["H2"]),
        bullet(
            [
                "进入 AI 需求分析，选择或上传需求文件。PDF 建议 10MB 以下、2-3 页，流程图类 PDF 优先。",
                "等待文件解析完成。若提示 OCR 乱码率高、节点过少或文本过短，补充说明后重新分析。",
                "选择分析模板。流程图 PDF 建议使用“标准结构化报告”或流程图专项模板。",
                "填写需求描述和补充说明，把约束、术语、接口约定、权限边界写清楚。",
                "根据需要打开或关闭人工审阅。关闭后分析结束会自动通过；打开后需要手动确认。",
                "点击开始分析，等待右侧终端输出结构化报告。",
            ],
            styles["BodyCN"],
        ),
        p("分析报告中重点查看", styles["H2"]),
        table(
            [
                ["报告区块", "如何使用"],
                ["需求清单 REQ-ID", "确认每个核心需求都被编号，后续生成用例会带上需求追踪关系。"],
                ["流程路径 TP-ID", "流程图场景中确认主路径、分支路径和异常路径是否完整。"],
                ["待确认问题", "把角色、权限、边界、异常、数据状态等不清楚的点整理给产品或研发确认。"],
                ["质量评分", "优先补齐低分项，如接口明确度、风险覆盖度、流程完整度。"],
                ["测试策略", "作为后续测试范围、测试类型、准入准出标准的初稿。"],
            ],
            [4 * cm, 12 * cm],
        ),
        p(
            "提示：如果切换模块或浏览器 tab，平台会把流式输出缓存到 Redis。重新进入页面后，可从分析历史恢复快照或查看最终状态。",
            styles["Callout"],
        ),
        PageBreak(),
    ]

    story += [
        p("4. 生成测试用例", styles["H1"]),
        p(
            "生成用例页支持从文本、文件或 AI 需求分析结果导入内容。建议先通过 AI 需求分析得到 REQ-ID/TP-ID，再生成用例，"
            "这样后续评审和覆盖矩阵更容易闭环。",
            styles["BodyCN"],
        ),
        p("推荐配置", styles["H2"]),
        table(
            [
                ["配置项", "建议"],
                ["输入来源", "需求已整理时用文本输入；需要复用上传解析内容时用文件输入；从分析页跳转时自动带入报告上下文。"],
                ["提示词模板", "优先选择与你的场景一致的模板，例如功能测试、流程图路径覆盖、接口测试或回归测试。"],
                ["Max Tokens", "大量用例时调高上限；如仍截断，按模块或流程路径分批生成。"],
                ["质量修复", "保持开启，用于补齐标题、步骤、预期、覆盖关系和可执行性说明。"],
            ],
            [4 * cm, 12 * cm],
        ),
        p("结果处理", styles["H2"]),
        bullet(
            [
                "先看质量评分和问题提示，确认是否存在不相关用例、重复用例或不可执行步骤。",
                "每页可按 20/30/50 条查看，适合大批量生成后的快速筛选。",
                "确认后进入用例评审中心进行结构化编辑、评论和执行结果导入。",
                "需要交付时，可导出 Excel、复制文本或分享生成记录。",
            ],
            styles["BodyCN"],
        ),
        PageBreak(),
    ]

    story += [
        p("5. 用例评审中心与覆盖闭环", styles["H1"]),
        p(
            "评审中心用于把 AI 生成结果变成可交付资产。它承接用例结构化编辑、版本对比、评论协作、自动化执行结果导入和覆盖矩阵查看。",
            styles["BodyCN"],
        ),
        table(
            [
                ["场景", "操作", "产出"],
                ["结构化编辑", "进入评审详情，修改标题、前置条件、步骤、预期、优先级和标签。", "规范后的测试用例"],
                ["版本对比", "点击版本历史，查看每次修订差异。", "diff 记录和追溯证据"],
                ["评论审阅", "提交修改意见或确认通过。", "评审结论"],
                ["执行结果导入", "导入 Playwright/JUnit/JSON 结果，按 caseId、TP-ID、REQ-ID 或标题匹配。", "实际结果和最新执行状态"],
                ["覆盖矩阵", "查看需求、关联用例、自动化可行性和未覆盖原因。", "需求到执行结果的闭环视图"],
            ],
            [3.2 * cm, 7 * cm, 5.8 * cm],
        ),
        p("覆盖闭环模型", styles["H2"]),
        WorkflowStrip(["REQ 需求", "TP 路径", "测试用例", "自动执行", "结果回写"]),
        PageBreak(),
    ]

    story += [
        p("6. 文件解析、OCR 与流程图 PDF", styles["H1"]),
        p(
            "文件解析模块会先尝试 PDF 内置文本层；文本不足或为扫描件时进入 OCR/多模态链路；流程图 PDF 会额外提取节点、分支、主路径和异常路径。",
            styles["BodyCN"],
        ),
        table(
            [
                ["输入类型", "建议", "异常处理"],
                ["流程图 PDF", "优先上传清晰、页数少、节点文字完整的 PDF。", "节点少于 3 或分支缺失时，补充说明后重新分析。"],
                ["截图/图片", "使用高清截图，避免压缩、水印和深色低对比。", "识别为空时改用文本补充或重新截图。"],
                ["Word/Excel", "适合结构化需求、规则表和用例草稿。", "表格过复杂时建议导出为简化 Excel 或复制关键字段。"],
                ["纯文本", "适合快速输入需求、缺陷描述或接口说明。", "文本过短会触发低质量提醒，需要补充角色、边界和异常。"],
            ],
            [3.5 * cm, 7 * cm, 5.5 * cm],
        ),
        p("长任务状态", styles["H2"]),
        bullet(
            [
                "解析进度优先写入 Redis 实时态，数据库保存最终态和低频心跳。",
                "页面刷新或切换模块后，回到页面可继续看到最新解析/分析状态。",
                "VPS 部署后可在系统设置的运行环境区查看 Redis、队列和文件解析 Worker 状态。",
            ],
            styles["BodyCN"],
        ),
        PageBreak(),
    ]

    story += [
        p("7. 模板、模型与系统设置", styles["H1"]),
        p(
            "模板和模型配置决定 AI 输出质量。建议把常用场景沉淀为模板，并为不同任务选择合适模型：文本分析模型、视觉模型、长上下文模型、低成本快速模型。",
            styles["BodyCN"],
        ),
        table(
            [
                ["配置", "说明", "检查点"],
                ["提示词模板", "管理分析/生成提示词，支持评测和优化。", "是否要求 JSON、是否包含数量底线、是否说明 REQ/TP"],
                ["模型配置", "配置 provider、modelId、Base URL、API Key、Max Tokens、视觉能力。", "测试按钮通过；默认模型可用；外网模型需要代理或可达网络"],
                ["生成默认", "保存默认温度和 Token 上限。", "长输出任务建议提高 Max Tokens"],
                ["运行环境", "查看上传上限、限流、Redis、队列和 Worker。", "Redis ready；file-parse 队列不过量积压"],
            ],
            [3.3 * cm, 7 * cm, 5.7 * cm],
        ),
        p("模型选择建议", styles["H2"]),
        bullet(
            [
                "结构化 JSON 要求高：优先选择支持 json_schema 或兼容性稳定的模型。",
                "流程图/图片理解：优先选择视觉模型或平台内“文档视觉解析”专用模型。",
                "长报告/大量用例：选择长上下文和高输出 token 模型，并按模块拆分任务。",
                "外网模型：确认 VPS 可访问 Base URL，必要时配置代理或使用国内兼容网关。",
            ],
            styles["BodyCN"],
        ),
        PageBreak(),
    ]

    story += [
        p("8. 常见问题与处理办法", styles["H1"]),
        table(
            [
                ["问题", "原因", "处理"],
                ["一直显示 PROCESSING", "流式连接断开、页面切换或后台任务未回写最终态。", "重新进入历史记录恢复快照；确认 Redis ready；必要时查看生成记录详情。"],
                ["AI 输出被截断", "Max Tokens 不足或一次生成范围过大。", "提高输出上限，按模块/路径分批生成，或缩短提示词。"],
                ["生成了不相关用例", "需求输入混杂、模板约束不够、模型发散。", "补充范围边界，使用质量修复，按 REQ/TP 过滤。"],
                ["PDF 解析慢", "扫描件、图片多、OCR 或多模态耗时。", "优先使用内置文本 PDF；拆分页；检查 Redis/Worker 状态。"],
                ["人工审阅开关总是开启", "旧版本未保存偏好。", "当前版本会持久化开关状态；如需恢复默认可清理浏览器本地存储。"],
                ["OpenAI/GPT 连不上", "VPS 网络或代理不可达、Base URL/API Key 错误。", "在模型配置页测试；确认代理和防火墙；必要时使用国内兼容模型。"],
            ],
            [3.5 * cm, 5.5 * cm, 7 * cm],
        ),
        p("推荐验收清单", styles["H2"]),
        bullet(
            [
                "上传一份 2-3 页流程图 PDF，确认解析完成并能生成 REQ-ID/TP-ID。",
                "关闭人工审阅，退出页面再进入，确认开关状态保持关闭。",
                "开始一次 AI 分析后切换到其它模块，再回到分析页，确认历史记录可恢复快照或最终态。",
                "从分析报告点击生成用例，确认请求上下文包含 REQ-ID/TP-ID。",
                "进入评审中心导入执行结果，确认覆盖矩阵状态刷新。",
            ],
            styles["BodyCN"],
        ),
    ]

    return story


def draw_header_footer(canvas, doc):
    canvas.saveState()
    width, height = A4
    canvas.setFillColor(colors.HexColor("#64748B"))
    canvas.setFont(FONT, 7)
    canvas.drawString(doc.leftMargin, height - 10 * mm, "AI 用例平台产品使用手册")
    canvas.drawRightString(width - doc.rightMargin, height - 10 * mm, "2026-06-18")
    canvas.setStrokeColor(colors.HexColor("#E2E8F0"))
    canvas.line(doc.leftMargin, height - 12 * mm, width - doc.rightMargin, height - 12 * mm)
    canvas.setFont(FONT, 7)
    canvas.drawCentredString(width / 2, 9 * mm, f"第 {doc.page} 页")
    canvas.restoreState()


def build_pdf() -> None:
    ensure_assets()
    doc = SimpleDocTemplate(
        str(PDF_PATH),
        pagesize=A4,
        rightMargin=1.6 * cm,
        leftMargin=1.6 * cm,
        topMargin=1.8 * cm,
        bottomMargin=1.5 * cm,
        title="AI 用例平台产品使用手册",
        author="Codex",
    )
    doc.build(build_story(), onFirstPage=draw_header_footer, onLaterPages=draw_header_footer)
    print(PDF_PATH)


if __name__ == "__main__":
    build_pdf()
