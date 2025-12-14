// author.yichengup.CanvasAnimationPathBrush 2025.01.XX
import { app } from "../../../scripts/app.js";
import { initUIBindings } from "./CanvasAnimationPathBrush.ui.js";
import { initInteractionBindings } from "./CanvasAnimationPathBrush.interactions.js";

const DEFAULT_LAYOUT = {
    shiftLeft: 10,
    shiftRight: 100,
    panelHeight: 58, // 增加高度以容纳两行按钮（21px按钮高度 + 5px间距）
    timelineHeight: 40
};

class ycCanvasAnimationPathBrush {
    constructor(node) {
        this.node = node;
        this.state = createInitialState(node);
        initUIBindings(node, this.state);
        initInteractionBindings(node, this.state);
    }
}

function createInitialState(node) {
    if (!node.properties) {
        node.properties = {};
    }

    const defaults = {
        keyframes: [], // [{frame: 0, paths: [{points: [{x, y, cp1, cp2}, ...], keyframePoints: [{index, frame}, ...]}]}, ...]
        selectedKeyframe: -1, // 当前选中的关键帧索引
        currentPath: [], // 当前正在绘制的原始路径点（画笔绘制）
        bezierPath: null, // 转换后的贝塞尔曲线路径 {points: [{x, y, cp1, cp2}, ...], keyframePoints: [{index, frame}, ...]}
        isDrawing: false,
        editMode: false, // 编辑模式：可以添加/删除关键帧点
        canvasWidth: 512,
        canvasHeight: 512,
        totalFrames: 60,
        buttons: [],
        timeline: null,
        backgroundImageObj: null,
        imageBase64Data: ""
    };

    node.properties = {
        ...defaults,
        ...node.properties
    };

    node.size = node.size || [500, 600];

    return {
        layout: { ...DEFAULT_LAYOUT },
        fontSize: LiteGraph?.NODE_SUBTEXT_SIZE ?? 10
    };
}

// author.yichengup.CanvasAnimationPathBrush 2025.01.XX
app.registerExtension({
    name: "ycCanvasAnimationPathBrush",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "ycCanvasAnimationPathBrush") {
            return;
        }

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            if (onNodeCreated) {
                onNodeCreated.apply(this, []);
            }
            this.ycCanvasAnimationPathBrush = new ycCanvasAnimationPathBrush(this);
            if (this.initButtons) {
                this.initButtons();
            }
        };
    }
});

// author.yichengup.CanvasAnimationPathBrush 2025.01.XX

