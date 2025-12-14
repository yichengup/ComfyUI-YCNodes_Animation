// author.yichengup.CanvasAnimationPathBrush.ui 2025.01.XX
import { sampleMultiplePaths } from "./BezierPathSampler.js";
import { PathDataParser } from "./PathDataParser.js";

export const WIDGET_NAMES = {
    PATH_DATA: "path_data",
    CANVAS_WIDTH: "canvas_width",
    CANVAS_HEIGHT: "canvas_height",
    TOTAL_FRAMES: "total_frames",
    IMAGE_BASE64: "image_base64"
};

export function initUIBindings(node, state) {
    const { shiftLeft, shiftRight, panelHeight, timelineHeight } = state.layout;
    const fontsize = state.fontSize;

    setupHiddenWidgets(node);

    node.initButtons = function () {
        if (this.outputs && this.outputs.length >= 5) {
            this.outputs[0].name = this.outputs[0].localized_name = "path_data";
            this.outputs[1].name = this.outputs[1].localized_name = "canvas_width";
            this.outputs[2].name = this.outputs[2].localized_name = "canvas_height";
            this.outputs[3].name = this.outputs[3].localized_name = "total_frames";
            this.outputs[4].name = this.outputs[4].localized_name = "image";
        }

        this.widgets_start_y = -4.8e8 * LiteGraph.NODE_SLOT_HEIGHT;

        // 初始化值
        if (!this.widgets[0].value) this.widgets[0].value = 512;
        if (!this.widgets[1].value) this.widgets[1].value = 512;
        if (!this.widgets[3].value) this.widgets[3].value = 60;

        this.properties.canvasWidth = this.widgets[0].value || 512;
        this.properties.canvasHeight = this.widgets[1].value || 512;
        this.properties.totalFrames = this.widgets[3].value || 60;
        this.properties.backgroundImageObj = null;
        this.properties.imageBase64Data = "";

        const buttonY = 8;
        const buttonHeight = 21;
        const buttonSpacing = 5;
        const buttonRow2Y = buttonY + buttonHeight + 5;

        let buttonX = 10;
        const buttonWidth1 = 66; // 第一行按钮宽度
        const buttonWidth2 = 50; // 第二行按钮宽度

        this.properties.buttons = [
            // 第一行按钮
            {
                text: "Load Image",
                x: buttonX,
                y: buttonY,
                width: buttonWidth1,
                height: buttonHeight,
                action: () => this.loadImageFromFile()
            },
            {
                text: "Set Size",
                x: (buttonX += buttonWidth1 + buttonSpacing),
                y: buttonY,
                width: buttonWidth1,
                height: buttonHeight,
                action: () => {
                    const currentWidth = this.properties.canvasWidth || 512;
                    const currentHeight = this.properties.canvasHeight || 512;
                    
                    const newWidth = prompt("请输入画布宽度 (64-4096):", currentWidth);
                    if (newWidth !== null && !isNaN(newWidth)) {
                        const width = parseInt(newWidth);
                        if (width >= 64 && width <= 4096) {
                            this.updateCanvasSize(width, this.properties.canvasHeight);
                        } else {
                            alert("宽度必须在64到4096之间");
                        }
                    }
                    
                    const newHeight = prompt("请输入画布高度 (64-4096):", currentHeight);
                    if (newHeight !== null && !isNaN(newHeight)) {
                        const height = parseInt(newHeight);
                        if (height >= 64 && height <= 4096) {
                            this.updateCanvasSize(this.properties.canvasWidth, height);
                        } else {
                            alert("高度必须在64到4096之间");
                        }
                    }
                }
            },
            {
                text: "Set Frames",
                x: (buttonX += buttonWidth1 + buttonSpacing),
                y: buttonY,
                width: buttonWidth1,
                height: buttonHeight,
                action: () => {
                    const currentFrames = this.properties.totalFrames || 60;
                    const newFrames = prompt("请输入总帧数 (1-1000):", currentFrames);
                    if (newFrames !== null && !isNaN(newFrames)) {
                        const frames = parseInt(newFrames);
                        if (frames >= 1 && frames <= 1000) {
                            this.properties.totalFrames = frames;
                            const totalFramesWidget = this.widgets.find(w => w.name === WIDGET_NAMES.TOTAL_FRAMES);
                            if (totalFramesWidget) {
                                totalFramesWidget.value = frames;
                            }
                            this.updateThisNodeGraph?.();
                        } else {
                            alert("帧数必须在1到1000之间");
                        }
                    }
                }
            },
            // 第二行按钮
            {
                text: "Add KF",
                x: 10,
                y: buttonRow2Y,
                width: buttonWidth2,
                height: buttonHeight,
                action: () => {
                    const totalFrames = this.properties.totalFrames || 60;
                    const frameStr = prompt(`请输入关键帧位置 (0-${totalFrames-1}):`, "0");
                    if (frameStr !== null && !isNaN(frameStr)) {
                        const frame = parseInt(frameStr);
                        if (frame >= 0 && frame < totalFrames) {
                            // 检查是否已存在
                            const exists = this.properties.keyframes.some(kf => kf.frame === frame);
                            if (exists) {
                                alert("该关键帧已存在");
                                return;
                            }
                            
                            // 添加新关键帧
                            this.properties.keyframes.push({
                                frame: frame,
                                paths: []
                            });
                            
                            // 按帧号排序
                            this.properties.keyframes.sort((a, b) => a.frame - b.frame);
                            
                            // 选中新添加的关键帧
                            this.properties.selectedKeyframe = this.properties.keyframes.findIndex(kf => kf.frame === frame);
                            this.updateThisNodeGraph?.();
                        } else {
                            alert(`关键帧必须在0到${totalFrames-1}之间`);
                        }
                    }
                }
            },
            {
                text: "Del KF",
                x: 10 + (buttonWidth2 + buttonSpacing),
                y: buttonRow2Y,
                width: buttonWidth2,
                height: buttonHeight,
                action: () => {
                    if (this.properties.selectedKeyframe >= 0 && 
                        this.properties.selectedKeyframe < this.properties.keyframes.length) {
                        this.properties.keyframes.splice(this.properties.selectedKeyframe, 1);
                        if (this.properties.selectedKeyframe >= this.properties.keyframes.length) {
                            this.properties.selectedKeyframe = this.properties.keyframes.length - 1;
                        }
                        this.updateThisNodeGraph?.();
                    } else {
                        alert("没有选中的关键帧可删除");
                    }
                }
            },
            {
                text: "Clear",
                x: 10 + (buttonWidth2 + buttonSpacing) * 2,
                y: buttonRow2Y,
                width: 39,
                height: buttonHeight,
                action: () => {
                    if (this.properties.selectedKeyframe >= 0 && 
                        this.properties.selectedKeyframe < this.properties.keyframes.length) {
                        this.properties.keyframes[this.properties.selectedKeyframe].paths = [];
                        this.updateThisNodeGraph?.();
                    } else {
                        alert("请先选择一个关键帧");
                    }
                }
            },
            {
                text: "Edit",
                x: 10 + (buttonWidth2 + buttonSpacing) * 3,
                y: buttonRow2Y,
                width: buttonWidth2,
                height: buttonHeight,
                action: () => {
                    // 切换编辑模式
                    this.properties.editMode = !this.properties.editMode;
                    
                    if (this.properties.editMode) {
                        console.log("✏️ 编辑模式已激活");
                        console.log("💡 提示：");
                        console.log("  - 左键点击路径上的点：添加关键帧点");
                        console.log("  - 左键点击关键帧点：编辑关键帧编号");
                        console.log("  - 右键点击关键帧点：删除关键帧点");
                        console.log("  - 双击：退出编辑模式");
                    } else {
                        // 退出编辑模式时，清除临时贝塞尔路径
                        this.properties.bezierPath = null;
                    }
                    
                    this.updateThisNodeGraph?.();
                }
            }
        ];
    };

    node.onAdded = function () {
        this.initButtons?.();
    };

    node.onConfigure = function () {
        // 隐藏不需要显示的参数
        const totalFramesWidget = this.widgets.find(w => w.name === WIDGET_NAMES.TOTAL_FRAMES);
        const autoNormalizeWidget = this.widgets.find(w => w.name === "auto_normalize");
        
        if (totalFramesWidget) {
            totalFramesWidget.hidden = true;
        }
        if (autoNormalizeWidget) {
            autoNormalizeWidget.hidden = true;
        }

        // 从widgets读取值
        const widthWidget = this.widgets.find(w => w.name === WIDGET_NAMES.CANVAS_WIDTH);
        const heightWidget = this.widgets.find(w => w.name === WIDGET_NAMES.CANVAS_HEIGHT);

        if (widthWidget && heightWidget) {
            const width = widthWidget.value || 512;
            const height = heightWidget.value || 512;
            this.updateCanvasSize(width, height);
        }

        if (totalFramesWidget) {
            this.properties.totalFrames = totalFramesWidget.value || 60;
        }

        // 加载背景图片（如果有）
        const imageBase64Widget = this.widgets.find(w => w.name === WIDGET_NAMES.IMAGE_BASE64);
        if (imageBase64Widget && imageBase64Widget.value) {
            this.properties.imageBase64Data = imageBase64Widget.value;
            this.loadBackgroundImageFromBase64(imageBase64Widget.value);
        } else if (this.properties.imageBase64Data) {
            this.loadBackgroundImageFromBase64(this.properties.imageBase64Data);
        }

        // 解析路径数据（使用新的PathDataParser，支持新旧格式）
        const pathDataWidget = this.widgets.find(w => w.name === WIDGET_NAMES.PATH_DATA);
        if (pathDataWidget && pathDataWidget.value) {
            try {
                const pathData = pathDataWidget.value;
                if (pathData && pathData.trim()) {
                    // 使用PathDataParser解析（自动识别新旧格式）
                    const parsedData = PathDataParser.parse(pathData);
                    
                    // 转换为前端内部格式
                    this.properties.keyframes = [];
                    for (const kf of parsedData.keyframes || []) {
                        const paths = [];
                        if (kf.points && kf.points.length > 0) {
                            // 将点序列转换为路径对象
                            paths.push({ 
                                points: kf.points.map(p => ({ x: p.x, y: p.y })),
                                keyframePoints: [] // 从元数据中恢复关键帧点（如果需要）
                            });
                        }
                        
                        this.properties.keyframes.push({
                            frame: kf.frame,
                            paths: paths,
                            direction: kf.direction || 1, // 保存方向信息
                            metadata: kf.metadata || {}
                        });
                    }
                    
                    // 按帧号排序（PathDataParser已排序，但确保一致性）
                    this.properties.keyframes.sort((a, b) => a.frame - b.frame);
                }
            } catch (e) {
                console.error("Error parsing path data:", e);
                this.properties.keyframes = [];
            }
        }

        this.initButtons?.();
    };

    node.updateCanvasSize = function (width, height) {
        if (!width || !height || width <= 0 || height <= 0) {
            return;
        }

        this.properties.canvasWidth = width;
        this.properties.canvasHeight = height;

        const widthWidget = this.widgets.find(w => w.name === WIDGET_NAMES.CANVAS_WIDTH);
        const heightWidget = this.widgets.find(w => w.name === WIDGET_NAMES.CANVAS_HEIGHT);
        if (widthWidget) widthWidget.value = width;
        if (heightWidget) heightWidget.value = height;

        // 计算显示尺寸（保持宽高比，最大500px）
        const maxDisplaySize = 500;
        const scale = Math.min(
            maxDisplaySize / width,
            maxDisplaySize / height,
            1.0
        );

        const displayWidth = Math.max(300, Math.min(width * scale + shiftRight + shiftLeft, 800));
        const displayHeight = Math.max(300, Math.min(height * scale + shiftLeft * 2 + panelHeight + timelineHeight, 800));

        this.size = [displayWidth, displayHeight];
        this.updateThisNodeGraph?.();
    };

    node.onDrawForeground = function (ctx) {
        if (this.flags.collapsed) {
            return false;
        }

        const canvasWidth = this.properties.canvasWidth || 512;
        const canvasHeight = this.properties.canvasHeight || 512;
        const totalFrames = this.properties.totalFrames || 60;

        // 绘制控制面板
        const panelY = shiftLeft;
        ctx.fillStyle = "rgba(40,40,40,0.9)";
        ctx.beginPath();
        ctx.roundRect(shiftLeft - 4, panelY - 4, this.size[0] - shiftRight - shiftLeft + 8, panelHeight, 4);
        ctx.fill();

        ctx.strokeStyle = "rgba(100,100,100,0.5)";
        ctx.lineWidth = 1;
        ctx.strokeRect(shiftLeft - 4, panelY - 4, this.size[0] - shiftRight - shiftLeft + 8, panelHeight);

        // 计算画布区域
        let canvasAreaWidth = this.size[0] - shiftRight - shiftLeft;
        let canvasAreaHeight = this.size[1] - shiftLeft - shiftLeft - panelHeight - timelineHeight;

        const scaleX = canvasAreaWidth / canvasWidth;
        const scaleY = canvasAreaHeight / canvasHeight;
        const scale = Math.min(scaleX, scaleY);

        const scaledWidth = canvasWidth * scale;
        const scaledHeight = canvasHeight * scale;
        const offsetX = shiftLeft + (canvasAreaWidth - scaledWidth) / 2;
        const offsetY = shiftLeft + panelHeight + (canvasAreaHeight - scaledHeight) / 2;

        // 绘制画布背景
        ctx.fillStyle = "rgba(20,20,20,0.8)";
        ctx.beginPath();
        ctx.roundRect(offsetX - 4, offsetY - 4, scaledWidth + 8, scaledHeight + 8, 4);
        ctx.fill();

        // 绘制背景图片（如果有）
        if (this.properties.backgroundImageObj && this.properties.backgroundImageObj.complete) {
            try {
                ctx.drawImage(
                    this.properties.backgroundImageObj,
                    offsetX,
                    offsetY,
                    scaledWidth,
                    scaledHeight
                );
            } catch (e) {
                console.error("Error drawing background image:", e);
                // 如果绘制失败，显示网格
                drawGrid();
            }
        } else {
            // 绘制网格
            drawGrid();
        }

        function drawGrid() {
            ctx.fillStyle = "rgba(100,100,100,0.2)";
            ctx.strokeStyle = "rgba(150,150,150,0.2)";
            ctx.lineWidth = 1;
            const gridSize = 32;
            const gridScale = gridSize * scale;

            for (let x = offsetX; x <= offsetX + scaledWidth; x += gridScale) {
                ctx.beginPath();
                ctx.moveTo(x, offsetY);
                ctx.lineTo(x, offsetY + scaledHeight);
                ctx.stroke();
            }

            for (let y = offsetY; y <= offsetY + scaledHeight; y += gridScale) {
                ctx.beginPath();
                ctx.moveTo(offsetX, y);
                ctx.lineTo(offsetX + scaledWidth, y);
                ctx.stroke();
            }
        }

        // 绘制所有关键帧的路径
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        
        for (let kfIdx = 0; kfIdx < this.properties.keyframes.length; kfIdx++) {
            const keyframe = this.properties.keyframes[kfIdx];
            const isSelected = (kfIdx === this.properties.selectedKeyframe);
            
            // 设置颜色
            ctx.strokeStyle = isSelected ? "rgba(100,200,255,0.9)" : "rgba(100,200,255,0.5)";
            ctx.lineWidth = isSelected ? 2 : 1;
            
            // 绘制该关键帧的所有路径
            for (const path of keyframe.paths) {
                if (path.points && path.points.length > 1) {
                    ctx.beginPath();
                    const firstPoint = path.points[0];
                    ctx.moveTo(offsetX + firstPoint.x * scale, offsetY + firstPoint.y * scale);
                    
                    // 检查是否是贝塞尔曲线路径
                    const isBezierPath = path.points.some(p => p.cp1 || p.cp2);
                    
                    if (isBezierPath) {
                        // 绘制贝塞尔曲线
                        for (let i = 1; i < path.points.length; i++) {
                            const current = path.points[i];
                            const previous = path.points[i - 1];
                            
                            if (previous.cp2 && current.cp1) {
                                // 使用贝塞尔曲线
                                ctx.bezierCurveTo(
                                    offsetX + previous.cp2.x * scale,
                                    offsetY + previous.cp2.y * scale,
                                    offsetX + current.cp1.x * scale,
                                    offsetY + current.cp1.y * scale,
                                    offsetX + current.x * scale,
                                    offsetY + current.y * scale
                                );
                            } else {
                                // 直线连接
                                ctx.lineTo(offsetX + current.x * scale, offsetY + current.y * scale);
                            }
                        }
                    } else {
                        // 绘制直线路径
                        for (let i = 1; i < path.points.length; i++) {
                            const x = offsetX + path.points[i].x * scale;
                            const y = offsetY + path.points[i].y * scale;
                            ctx.lineTo(x, y);
                        }
                    }
                    ctx.stroke();
                }
            }
            
            // 绘制路径点和关键帧点
            // 使用Set去重，避免同一位置显示多个关键帧点
            const drawnKeyframePoints = new Set(); // 用于记录已绘制的关键帧点位置
            
            for (const path of keyframe.paths) {
                if (!path.points) continue;
                
                const isBezierPath = path.points.some(p => p.cp1 || p.cp2);
                const hasKeyframePoints = path.keyframePoints && path.keyframePoints.length > 0;
                
                // 绘制关键帧点（高亮显示）
                if (hasKeyframePoints) {
                    for (const kfPoint of path.keyframePoints) {
                        const pt = path.points[kfPoint.index];
                        if (!pt) continue;
                        
                        const x = offsetX + pt.x * scale;
                        const y = offsetY + pt.y * scale;
                        
                        // 检查是否已经在相同位置绘制过关键帧点（去重，避免重叠）
                        const pointKey = `${Math.round(x)},${Math.round(y)}`;
                        if (drawnKeyframePoints.has(pointKey)) {
                            continue; // 跳过重复的关键帧点
                        }
                        drawnKeyframePoints.add(pointKey);
                        
                        // 绘制关键帧点（大圆圈，高亮）
                        ctx.fillStyle = "rgba(255,200,0,0.9)";
                        ctx.strokeStyle = "rgba(255,255,255,1.0)";
                        ctx.lineWidth = 2;
                        ctx.beginPath();
                        ctx.arc(x, y, 6, 0, Math.PI * 2);
                        ctx.fill();
                        ctx.stroke();
                        
                        // 显示关键帧编号
                        ctx.fillStyle = LiteGraph.NODE_TEXT_COLOR;
                        ctx.font = `bold ${fontsize}px Arial`;
                        ctx.textAlign = "left";
                        ctx.fillText(`KF${kfPoint.frame}`, x + 8, y - 8);
                    }
                }
                
                // 绘制普通锚点（如果不在编辑模式或没有关键帧点）
                if (!this.properties.editMode || !hasKeyframePoints) {
                    ctx.fillStyle = isSelected ? "rgba(100,200,255,0.9)" : "rgba(100,200,255,0.6)";
                    
                    if (isBezierPath) {
                        // 贝塞尔路径：只绘制端点
                        if (path.points.length > 0) {
                            const firstPt = path.points[0];
                            const lastPt = path.points[path.points.length - 1];
                            
                            // 第一个点
                            const x1 = offsetX + firstPt.x * scale;
                            const y1 = offsetY + firstPt.y * scale;
                            ctx.beginPath();
                            ctx.arc(x1, y1, 3, 0, Math.PI * 2);
                            ctx.fill();
                            
                            // 最后一个点（如果不是同一个点）
                            if (path.points.length > 1) {
                                const x2 = offsetX + lastPt.x * scale;
                                const y2 = offsetY + lastPt.y * scale;
                                ctx.beginPath();
                                ctx.arc(x2, y2, 3, 0, Math.PI * 2);
                                ctx.fill();
                            }
                        }
                    } else {
                        // 普通路径：绘制所有点
                        for (const pt of path.points) {
                            const x = offsetX + pt.x * scale;
                            const y = offsetY + pt.y * scale;
                            ctx.beginPath();
                            ctx.arc(x, y, 3, 0, Math.PI * 2);
                            ctx.fill();
                        }
                    }
                }
            }
        }

        // 绘制当前正在绘制的路径（画笔模式）
        if (this.properties.isDrawing && this.properties.currentPath.length > 1) {
            ctx.strokeStyle = "rgba(255,200,100,0.8)";
            ctx.lineWidth = 2;
            ctx.beginPath();
            for (let i = 0; i < this.properties.currentPath.length; i++) {
                const x = offsetX + this.properties.currentPath[i].x * scale;
                const y = offsetY + this.properties.currentPath[i].y * scale;
                if (i === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            }
            ctx.stroke();
        }
        
        // 绘制编辑模式下的贝塞尔路径和关键帧点
        if (this.properties.editMode && this.properties.bezierPath) {
            const bezierPath = this.properties.bezierPath;
            
            // 绘制贝塞尔曲线路径
            ctx.strokeStyle = "rgba(255,200,100,0.8)";
            ctx.lineWidth = 2;
            ctx.beginPath();
            
            if (bezierPath.points.length > 0) {
                ctx.moveTo(offsetX + bezierPath.points[0].x * scale, offsetY + bezierPath.points[0].y * scale);
                
                for (let i = 1; i < bezierPath.points.length; i++) {
                    const current = bezierPath.points[i];
                    const previous = bezierPath.points[i - 1];
                    
                    if (previous.cp2 && current.cp1) {
                        // 贝塞尔曲线
                        ctx.bezierCurveTo(
                            offsetX + previous.cp2.x * scale,
                            offsetY + previous.cp2.y * scale,
                            offsetX + current.cp1.x * scale,
                            offsetY + current.cp1.y * scale,
                            offsetX + current.x * scale,
                            offsetY + current.y * scale
                        );
                    } else {
                        // 直线
                        ctx.lineTo(offsetX + current.x * scale, offsetY + current.y * scale);
                    }
                }
            }
            ctx.stroke();
            
            // 绘制所有锚点（小点）
            ctx.fillStyle = "rgba(100,200,255,0.6)";
            for (const pt of bezierPath.points) {
                const x = offsetX + pt.x * scale;
                const y = offsetY + pt.y * scale;
                ctx.beginPath();
                ctx.arc(x, y, 3, 0, Math.PI * 2);
                ctx.fill();
            }
            
            // 绘制关键帧点（高亮）
            if (bezierPath.keyframePoints) {
                for (const kfPoint of bezierPath.keyframePoints) {
                    const pt = bezierPath.points[kfPoint.index];
                    if (!pt) continue;
                    
                    const x = offsetX + pt.x * scale;
                    const y = offsetY + pt.y * scale;
                    
                    // 关键帧点（大圆圈，黄色高亮）
                    ctx.fillStyle = "rgba(255,200,0,0.9)";
                    ctx.strokeStyle = "rgba(255,255,255,1.0)";
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.arc(x, y, 6, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.stroke();
                    
                    // 显示关键帧编号
                    ctx.fillStyle = LiteGraph.NODE_TEXT_COLOR;
                    ctx.font = `bold ${fontsize}px Arial`;
                    ctx.textAlign = "left";
                    ctx.fillText(`KF${kfPoint.frame}`, x + 8, y - 8);
                }
            }
        }

        // 绘制时间轴
        const timelineY = offsetY + scaledHeight + 10;
        ctx.fillStyle = "rgba(40,40,40,0.9)";
        ctx.fillRect(offsetX, timelineY, scaledWidth, timelineHeight);

        // 绘制时间轴刻度
        ctx.strokeStyle = "rgba(150,150,150,0.5)";
        ctx.lineWidth = 1;
        const tickCount = Math.min(totalFrames, 20);
        for (let i = 0; i <= tickCount; i++) {
            const frame = Math.floor((i / tickCount) * totalFrames);
            const x = offsetX + (i / tickCount) * scaledWidth;
            ctx.beginPath();
            ctx.moveTo(x, timelineY);
            ctx.lineTo(x, timelineY + timelineHeight);
            ctx.stroke();
            
            // 显示帧号
            ctx.fillStyle = LiteGraph.NODE_TEXT_COLOR;
            ctx.font = "10px Arial";
            ctx.textAlign = "center";
            ctx.fillText(frame.toString(), x, timelineY + timelineHeight - 5);
        }

        // 绘制关键帧标记
        for (let kfIdx = 0; kfIdx < this.properties.keyframes.length; kfIdx++) {
            const keyframe = this.properties.keyframes[kfIdx];
            const x = offsetX + (keyframe.frame / totalFrames) * scaledWidth;
            const isSelected = (kfIdx === this.properties.selectedKeyframe);
            
            ctx.fillStyle = isSelected ? "rgba(100,200,255,1.0)" : "rgba(100,200,255,0.7)";
            ctx.beginPath();
            ctx.moveTo(x, timelineY);
            ctx.lineTo(x - 5, timelineY + 8);
            ctx.lineTo(x + 5, timelineY + 8);
            ctx.closePath();
            ctx.fill();
        }

        // 显示画布尺寸
        ctx.fillStyle = LiteGraph.NODE_TEXT_COLOR;
        ctx.font = `${fontsize}px Arial`;
        ctx.textAlign = "center";
        ctx.fillText(`${canvasWidth}×${canvasHeight}`, this.size[0] / 2, offsetY + scaledHeight + timelineHeight + 15);

        // 绘制按钮
        for (const button of this.properties.buttons) {
            // 高亮激活的编辑模式按钮
            if (button.text === "Edit" && this.properties.editMode) {
                ctx.fillStyle = "rgba(100,200,255,0.8)";
            } else {
                ctx.fillStyle = "rgba(60,60,60,0.7)";
            }
            ctx.fillRect(button.x, button.y, button.width, button.height);

            ctx.strokeStyle = "rgba(150,150,150,0.6)";
            ctx.lineWidth = 1;
            ctx.strokeRect(button.x, button.y, button.width, button.height);

            ctx.fillStyle = "rgba(220,220,220,0.9)";
            ctx.font = "11px Arial";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(button.text, button.x + button.width / 2, button.y + button.height / 2);
        }

        // 同步路径数据
        syncPathDataWidget(this);
    };
}

export function syncPathDataWidget(node) {
    // 收集所有关键帧的路径数据，使用新的JSON格式
    const framePathMap = {}; // {frame: [points], ...}
    
    for (const kf of node.properties.keyframes) {
        for (const path of kf.paths) {
            if (!path.points || path.points.length === 0) {
                continue;
            }
            
            // 检查是否是贝塞尔路径（包含控制点）
            const isBezierPath = path.points.some(p => p.cp1 || p.cp2);
            const hasKeyframePoints = path.keyframePoints && path.keyframePoints.length > 0;
            
            let sampledPoints = [];
            
            if (isBezierPath) {
                // 贝塞尔路径：使用采样
                try {
                    sampledPoints = sampleMultiplePaths([path], {
                        samplesPerSegment: 30,
                        minSamples: 2,
                        maxSamples: 100
                    });
                } catch (err) {
                    console.error("Error sampling bezier path:", err);
                    // 降级：直接使用锚点
                    sampledPoints = path.points.map(p => ({ x: p.x, y: p.y }));
                }
            } else {
                // 普通路径：直接使用点序列
                sampledPoints = path.points.map(p => ({ x: p.x, y: p.y }));
            }
            
            // 保持路径完整，所有关键帧点都使用完整路径
            // 关键帧点标记路径上的位置，后端会在关键帧之间沿着完整路径插值
            if (hasKeyframePoints && path.keyframePoints.length > 0) {
                // 按索引排序关键帧点
                const sortedKfPoints = path.keyframePoints.sort((a, b) => a.index - b.index);
                
                // 收集所有唯一的关键帧编号
                const uniqueFrames = new Set();
                for (const kfPoint of sortedKfPoints) {
                    uniqueFrames.add(kfPoint.frame);
                }
                
                // 将所有关键帧点对应的关键帧都添加完整路径
                // 这样后端会在所有关键帧之间沿着完整路径插值，而不是分段运动
                for (const frame of uniqueFrames) {
                    if (!framePathMap[frame]) {
                        framePathMap[frame] = [];
                    }
                    // 如果该关键帧还没有路径点，添加完整路径
                    if (framePathMap[frame].length === 0) {
                        framePathMap[frame].push(...sampledPoints);
                    } else {
                        // 合并路径（去重连接点）
                        const lastPoint = framePathMap[frame][framePathMap[frame].length - 1];
                        const firstPoint = sampledPoints[0];
                        
                        if (lastPoint && firstPoint &&
                            Math.abs(lastPoint.x - firstPoint.x) < 0.01 &&
                            Math.abs(lastPoint.y - firstPoint.y) < 0.01) {
                            framePathMap[frame].push(...sampledPoints.slice(1));
                        } else {
                            framePathMap[frame].push(...sampledPoints);
                        }
                    }
                }
            } else {
                // 没有关键帧点：使用路径所属的关键帧
                if (!framePathMap[kf.frame]) {
                    framePathMap[kf.frame] = [];
                }
                // 如果该关键帧已有路径点，合并路径（去重连接点）
                if (framePathMap[kf.frame].length === 0) {
                    framePathMap[kf.frame].push(...sampledPoints);
                } else {
                    const lastPoint = framePathMap[kf.frame][framePathMap[kf.frame].length - 1];
                    const firstPoint = sampledPoints[0];
                    
                    if (lastPoint && firstPoint &&
                        Math.abs(lastPoint.x - firstPoint.x) < 0.01 &&
                        Math.abs(lastPoint.y - firstPoint.y) < 0.01) {
                        framePathMap[kf.frame].push(...sampledPoints.slice(1));
                    } else {
                        framePathMap[kf.frame].push(...sampledPoints);
                    }
                }
            }
        }
    }
    
    // 转换为新的JSON格式
    const keyframes = Object.keys(framePathMap)
        .sort((a, b) => parseInt(a) - parseInt(b))
        .map(frame => ({
            frame: parseInt(frame),
            points: framePathMap[frame],
            direction: node.properties.keyframes.find(kf => kf.frame === parseInt(frame))?.direction || 1,
            metadata: node.properties.keyframes.find(kf => kf.frame === parseInt(frame))?.metadata || {}
        }));
    
    // 使用PathDataParser序列化（JSON格式）
    const pathData = PathDataParser.serialize(keyframes, true, {});
    
    // 更新隐藏的路径数据widget
    const pathDataWidget = node.widgets?.find(w => w.name === WIDGET_NAMES.PATH_DATA);
    if (pathDataWidget) {
        pathDataWidget.value = pathData;
    }
}

function setupHiddenWidgets(node) {
    const pathDataWidget = node.widgets.find(w => w.name === WIDGET_NAMES.PATH_DATA);
    if (pathDataWidget) {
        pathDataWidget.hidden = true;
    }

    let widthWidget = node.widgets.find(w => w.name === WIDGET_NAMES.CANVAS_WIDTH);
    let heightWidget = node.widgets.find(w => w.name === WIDGET_NAMES.CANVAS_HEIGHT);
    let totalFramesWidget = node.widgets.find(w => w.name === WIDGET_NAMES.TOTAL_FRAMES);
    let imageBase64Widget = node.widgets.find(w => w.name === WIDGET_NAMES.IMAGE_BASE64);

    if (!widthWidget) {
        widthWidget = node.addWidget("number", WIDGET_NAMES.CANVAS_WIDTH, 512, () => { }, { min: 64, max: 4096 });
        widthWidget.hidden = true;
    }
    if (!heightWidget) {
        heightWidget = node.addWidget("number", WIDGET_NAMES.CANVAS_HEIGHT, 512, () => { }, { min: 64, max: 4096 });
        heightWidget.hidden = true;
    }
    if (!totalFramesWidget) {
        totalFramesWidget = node.addWidget("number", WIDGET_NAMES.TOTAL_FRAMES, 60, () => { }, { min: 1, max: 1000 });
        totalFramesWidget.hidden = true;
    }
    if (!imageBase64Widget) {
        imageBase64Widget = node.addWidget("text", WIDGET_NAMES.IMAGE_BASE64, "", () => { });
        imageBase64Widget.hidden = true;
    }

    // 隐藏 auto_normalize 参数（如果存在）
    const autoNormalizeWidget = node.widgets.find(w => w.name === "auto_normalize");
    if (autoNormalizeWidget) {
        autoNormalizeWidget.hidden = true;
    }

    // 确保 total_frames widget 已隐藏（如果已存在）
    if (totalFramesWidget) {
        totalFramesWidget.hidden = true;
    }

    node.properties.backgroundImageObj = null;
    node.properties.imageBase64Data = "";
}

// author.yichengup.CanvasAnimationPathBrush.ui 2025.01.XX

