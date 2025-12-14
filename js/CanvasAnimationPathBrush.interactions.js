// author.yichengup.CanvasAnimationPathBrush.interactions 2025.01.XX
import { syncPathDataWidget, WIDGET_NAMES } from "./CanvasAnimationPathBrush.ui.js";
import { processBrushPath } from "./PathSmoother.js";
import { sampleMultiplePaths, bezierPoint } from "./BezierPathSampler.js";

export function initInteractionBindings(node, state) {
    const { shiftLeft, shiftRight, panelHeight, timelineHeight } = state.layout;

    node.onMouseDown = function (e) {
        if (e.canvasY - this.pos[1] < 0) {
            return false;
        }

        const mouseX = e.canvasX - this.pos[0];
        const mouseY = e.canvasY - this.pos[1];

        // 检查控制面板按钮
        if (mouseY >= shiftLeft && mouseY <= shiftLeft + panelHeight) {
            for (const button of this.properties.buttons) {
                if (button.action && mouseX >= button.x && mouseX <= button.x + button.width &&
                    mouseY >= button.y && mouseY <= button.y + button.height) {
                    button.action();
                    return true;
                }
            }
            return false;
        }

        const canvasWidth = this.properties.canvasWidth || 512;
        const canvasHeight = this.properties.canvasHeight || 512;
        let canvasAreaWidth = this.size[0] - shiftRight - shiftLeft;
        let canvasAreaHeight = this.size[1] - shiftLeft - shiftLeft - panelHeight - timelineHeight;

        const scaleX = canvasAreaWidth / canvasWidth;
        const scaleY = canvasAreaHeight / canvasHeight;
        const scale = Math.min(scaleX, scaleY);

        const scaledWidth = canvasWidth * scale;
        const scaledHeight = canvasHeight * scale;
        const offsetX = shiftLeft + (canvasAreaWidth - scaledWidth) / 2;
        const offsetY = shiftLeft + panelHeight + (canvasAreaHeight - scaledHeight) / 2;

        // 检查时间轴点击
        const timelineY = offsetY + scaledHeight + 10;
        if (mouseY >= timelineY && mouseY <= timelineY + timelineHeight) {
            const totalFrames = this.properties.totalFrames || 60;
            const relativeX = mouseX - offsetX;
            const clickedFrame = Math.floor((relativeX / scaledWidth) * totalFrames);
            
            // 查找最接近的关键帧
            let closestIdx = -1;
            let minDist = Infinity;
            for (let i = 0; i < this.properties.keyframes.length; i++) {
                const dist = Math.abs(this.properties.keyframes[i].frame - clickedFrame);
                if (dist < minDist && dist < totalFrames * 0.05) { // 5%容差
                    minDist = dist;
                    closestIdx = i;
                }
            }
            
            if (closestIdx >= 0) {
                this.properties.selectedKeyframe = closestIdx;
                this.updateThisNodeGraph?.();
            }
            return true;
        }

        // 检查画布区域点击
        if (e.canvasX < this.pos[0] + offsetX ||
            e.canvasX > this.pos[0] + offsetX + scaledWidth) return false;
        if (e.canvasY < this.pos[1] + offsetY ||
            e.canvasY > this.pos[1] + offsetY + scaledHeight) return false;

        // 右键点击 - 编辑关键帧点（编辑模式）
        if (e.button === 2 && this.properties.editMode && this.properties.bezierPath) {
            let localX = e.canvasX - this.pos[0] - offsetX;
            let localY = e.canvasY - this.pos[1] - offsetY;
            let realX = localX / scale;
            let realY = localY / scale;
            
            const hitRadius = 8 / scale;
            const bezierPath = this.properties.bezierPath;
            
            // 检查是否点击了关键帧点
            if (bezierPath.keyframePoints) {
                for (let i = bezierPath.keyframePoints.length - 1; i >= 0; i--) {
                    const kfPoint = bezierPath.keyframePoints[i];
                    const anchor = bezierPath.points[kfPoint.index];
                    if (anchor) {
                        const dist = Math.sqrt(
                            Math.pow(realX - anchor.x, 2) + Math.pow(realY - anchor.y, 2)
                        );
                        if (dist <= hitRadius) {
                            // 删除关键帧点
                            bezierPath.keyframePoints.splice(i, 1);
                            
                            // 同步到已保存的路径
                            if (this.properties.selectedKeyframe >= 0 && 
                                this.properties.selectedKeyframe < this.properties.keyframes.length) {
                                const keyframe = this.properties.keyframes[this.properties.selectedKeyframe];
                                const lastPath = keyframe.paths[keyframe.paths.length - 1];
                                if (lastPath && lastPath.keyframePoints) {
                                    lastPath.keyframePoints = lastPath.keyframePoints.filter(
                                        kf => kf.index !== kfPoint.index
                                    );
                                }
                            }
                            
                            syncPathDataWidget(this);
                            this.updateThisNodeGraph?.();
                            return true;
                        }
                    }
                }
            }
            
            // 检查是否点击了路径上的点（添加关键帧点）
            // 对路径进行采样，找到最近的采样点
            let closestIndex = -1;
            let minDist = Infinity;
            const maxHitDistance = hitRadius * 3; // 扩大点击检测范围
            
            // 对贝塞尔路径进行采样，生成密集的点用于点击检测
            const sampledPoints = [];
            for (let i = 0; i < bezierPath.points.length; i++) {
                const pt = bezierPath.points[i];
                sampledPoints.push({ x: pt.x, y: pt.y, segmentIndex: i, t: 0 });
                
                // 如果有下一个点，在两点之间采样
                if (i < bezierPath.points.length - 1) {
                    const nextPt = bezierPath.points[i + 1];
                    const isBezier = pt.cp2 && nextPt.cp1;
                    
                    if (isBezier) {
                        // 贝塞尔曲线采样（更密集）
                        const samples = 20;
                        for (let j = 1; j < samples; j++) {
                            const t = j / samples;
                            const bezierPt = bezierPoint(
                                { x: pt.x, y: pt.y },
                                { x: pt.cp2.x, y: pt.cp2.y },
                                { x: nextPt.cp1.x, y: nextPt.cp1.y },
                                { x: nextPt.x, y: nextPt.y },
                                t
                            );
                            sampledPoints.push({ 
                                x: bezierPt.x, 
                                y: bezierPt.y, 
                                segmentIndex: i,
                                t: t
                            });
                        }
                    } else {
                        // 直线采样
                        const samples = 10;
                        for (let j = 1; j < samples; j++) {
                            const t = j / samples;
                            sampledPoints.push({
                                x: pt.x + (nextPt.x - pt.x) * t,
                                y: pt.y + (nextPt.y - pt.y) * t,
                                segmentIndex: i,
                                t: t
                            });
                        }
                    }
                }
            }
            
            // 找到最近的采样点
            for (let i = 0; i < sampledPoints.length; i++) {
                const pt = sampledPoints[i];
                const dist = Math.sqrt(
                    Math.pow(realX - pt.x, 2) + Math.pow(realY - pt.y, 2)
                );
                if (dist < minDist && dist <= maxHitDistance) {
                    minDist = dist;
                    // 计算实际索引：segmentIndex + t，然后四舍五入到最近的锚点
                    closestIndex = pt.segmentIndex + pt.t;
                }
            }
            
            // 如果找到了最近点，转换为整数索引（选择最近的锚点）
            if (closestIndex >= 0 && minDist <= maxHitDistance) {
                const anchorIndex = Math.round(closestIndex);
                closestIndex = Math.max(0, Math.min(anchorIndex, bezierPath.points.length - 1));
                // 添加关键帧点
                const currentFrame = this.properties.selectedKeyframe >= 0 && 
                                   this.properties.selectedKeyframe < this.properties.keyframes.length ?
                                   this.properties.keyframes[this.properties.selectedKeyframe].frame : 0;
                
                const totalFrames = this.properties.totalFrames || 60;
                const newFrameStr = prompt(`请输入关键帧编号 (0-${totalFrames-1}):`, currentFrame.toString());
                
                if (newFrameStr !== null && !isNaN(newFrameStr)) {
                    const newFrame = parseInt(newFrameStr);
                    if (newFrame >= 0 && newFrame < totalFrames) {
                        if (!bezierPath.keyframePoints) {
                            bezierPath.keyframePoints = [];
                        }
                        
                        // 检查是否已存在该索引的关键帧点
                        const existing = bezierPath.keyframePoints.find(kf => kf.index === closestIndex);
                        if (existing) {
                            existing.frame = newFrame;
                        } else {
                            bezierPath.keyframePoints.push({
                                index: closestIndex,
                                frame: newFrame
                            });
                        }
                        
                        // 按索引排序
                        bezierPath.keyframePoints.sort((a, b) => a.index - b.index);
                        
                        // 同步到已保存的路径
                        if (this.properties.selectedKeyframe >= 0 && 
                            this.properties.selectedKeyframe < this.properties.keyframes.length) {
                            const keyframe = this.properties.keyframes[this.properties.selectedKeyframe];
                            const lastPath = keyframe.paths[keyframe.paths.length - 1];
                            if (lastPath) {
                                lastPath.keyframePoints = [...bezierPath.keyframePoints];
                            }
                        }
                        
                        syncPathDataWidget(this);
                        this.updateThisNodeGraph?.();
                        return true;
                    } else {
                        alert(`关键帧必须在0到${totalFrames-1}之间`);
                    }
                }
                return true;
            }
        }

        // 左键点击 - 开始绘制路径（画笔模式）或编辑关键帧点
        if (e.button === 0) {
            // 编辑模式：检查是否点击了关键帧点进行编辑，或点击路径添加关键帧点
            if (this.properties.editMode && this.properties.bezierPath) {
                let localX = e.canvasX - this.pos[0] - offsetX;
                let localY = e.canvasY - this.pos[1] - offsetY;
                let realX = localX / scale;
                let realY = localY / scale;
                
                const hitRadius = 8 / scale;
                const bezierPath = this.properties.bezierPath;
                
                // 先检查是否点击了关键帧点（优先级更高）
                if (bezierPath.keyframePoints) {
                    for (const kfPoint of bezierPath.keyframePoints) {
                        const anchor = bezierPath.points[kfPoint.index];
                        if (anchor) {
                            const dist = Math.sqrt(
                                Math.pow(realX - anchor.x, 2) + Math.pow(realY - anchor.y, 2)
                            );
                            if (dist <= hitRadius) {
                                // 编辑关键帧编号
                                const totalFrames = this.properties.totalFrames || 60;
                                const newFrameStr = prompt(`请输入关键帧编号 (0-${totalFrames-1}):`, kfPoint.frame.toString());
                                
                                if (newFrameStr !== null && !isNaN(newFrameStr)) {
                                    const newFrame = parseInt(newFrameStr);
                                    if (newFrame >= 0 && newFrame < totalFrames) {
                                        kfPoint.frame = newFrame;
                                        
                                        // 同步到已保存的路径
                                        if (this.properties.selectedKeyframe >= 0 && 
                                            this.properties.selectedKeyframe < this.properties.keyframes.length) {
                                            const keyframe = this.properties.keyframes[this.properties.selectedKeyframe];
                                            for (const path of keyframe.paths) {
                                                if (path.keyframePoints) {
                                                    const savedKfPoint = path.keyframePoints.find(
                                                        kf => kf.index === kfPoint.index
                                                    );
                                                    if (savedKfPoint) {
                                                        savedKfPoint.frame = newFrame;
                                                    }
                                                }
                                            }
                                        }
                                        
                                        syncPathDataWidget(this);
                                        this.updateThisNodeGraph?.();
                                        return true;
                                    } else {
                                        alert(`关键帧必须在0到${totalFrames-1}之间`);
                                    }
                                }
                                return true;
                            }
                        }
                    }
                }
                
                // 如果没有点击关键帧点，检查是否点击了路径（添加关键帧点）
                let closestIndex = -1;
                let minDist = Infinity;
                const maxHitDistance = hitRadius * 3;
                
                // 对路径进行采样检测
                const sampledPoints = [];
                for (let i = 0; i < bezierPath.points.length; i++) {
                    const pt = bezierPath.points[i];
                    sampledPoints.push({ x: pt.x, y: pt.y, segmentIndex: i, t: 0 });
                    
                    if (i < bezierPath.points.length - 1) {
                        const nextPt = bezierPath.points[i + 1];
                        const isBezier = pt.cp2 && nextPt.cp1;
                        
                        if (isBezier) {
                            const samples = 20;
                            for (let j = 1; j < samples; j++) {
                                const t = j / samples;
                                const bezierPt = bezierPoint(
                                    { x: pt.x, y: pt.y },
                                    { x: pt.cp2.x, y: pt.cp2.y },
                                    { x: nextPt.cp1.x, y: nextPt.cp1.y },
                                    { x: nextPt.x, y: nextPt.y },
                                    t
                                );
                                sampledPoints.push({ 
                                    x: bezierPt.x, 
                                    y: bezierPt.y, 
                                    segmentIndex: i,
                                    t: t
                                });
                            }
                        } else {
                            const samples = 10;
                            for (let j = 1; j < samples; j++) {
                                const t = j / samples;
                                sampledPoints.push({
                                    x: pt.x + (nextPt.x - pt.x) * t,
                                    y: pt.y + (nextPt.y - pt.y) * t,
                                    segmentIndex: i,
                                    t: t
                                });
                            }
                        }
                    }
                }
                
                // 找到最近的采样点
                for (let i = 0; i < sampledPoints.length; i++) {
                    const pt = sampledPoints[i];
                    const dist = Math.sqrt(
                        Math.pow(realX - pt.x, 2) + Math.pow(realY - pt.y, 2)
                    );
                    if (dist < minDist && dist <= maxHitDistance) {
                        minDist = dist;
                        closestIndex = pt.segmentIndex + pt.t;
                    }
                }
                
                // 如果找到了最近点，添加关键帧点
                if (closestIndex >= 0 && minDist <= maxHitDistance) {
                    const anchorIndex = Math.round(closestIndex);
                    const finalIndex = Math.max(0, Math.min(anchorIndex, bezierPath.points.length - 1));
                    
                    // 检查是否已存在该索引的关键帧点
                    const existing = bezierPath.keyframePoints?.find(kf => kf.index === finalIndex);
                    if (existing) {
                        // 如果已存在，编辑它
                        const totalFrames = this.properties.totalFrames || 60;
                        const newFrameStr = prompt(`请输入关键帧编号 (0-${totalFrames-1}):`, existing.frame.toString());
                        
                        if (newFrameStr !== null && !isNaN(newFrameStr)) {
                            const newFrame = parseInt(newFrameStr);
                            if (newFrame >= 0 && newFrame < totalFrames) {
                                existing.frame = newFrame;
                                
                                // 同步到已保存的路径
                                if (this.properties.selectedKeyframe >= 0 && 
                                    this.properties.selectedKeyframe < this.properties.keyframes.length) {
                                    const keyframe = this.properties.keyframes[this.properties.selectedKeyframe];
                                    const lastPath = keyframe.paths[keyframe.paths.length - 1];
                                    if (lastPath && lastPath.keyframePoints) {
                                        const savedKfPoint = lastPath.keyframePoints.find(kf => kf.index === finalIndex);
                                        if (savedKfPoint) {
                                            savedKfPoint.frame = newFrame;
                                        }
                                    }
                                }
                                
                                syncPathDataWidget(this);
                                this.updateThisNodeGraph?.();
                                return true;
                            }
                        }
                    } else {
                        // 添加新的关键帧点
                        const currentFrame = this.properties.selectedKeyframe >= 0 && 
                                           this.properties.selectedKeyframe < this.properties.keyframes.length ?
                                           this.properties.keyframes[this.properties.selectedKeyframe].frame : 0;
                        
                        const totalFrames = this.properties.totalFrames || 60;
                        const newFrameStr = prompt(`请输入关键帧编号 (0-${totalFrames-1}):`, currentFrame.toString());
                        
                        if (newFrameStr !== null && !isNaN(newFrameStr)) {
                            const newFrame = parseInt(newFrameStr);
                            if (newFrame >= 0 && newFrame < totalFrames) {
                                if (!bezierPath.keyframePoints) {
                                    bezierPath.keyframePoints = [];
                                }
                                
                                bezierPath.keyframePoints.push({
                                    index: finalIndex,
                                    frame: newFrame
                                });
                                
                                // 按索引排序
                                bezierPath.keyframePoints.sort((a, b) => a.index - b.index);
                                
                                // 同步到已保存的路径
                                if (this.properties.selectedKeyframe >= 0 && 
                                    this.properties.selectedKeyframe < this.properties.keyframes.length) {
                                    const keyframe = this.properties.keyframes[this.properties.selectedKeyframe];
                                    const lastPath = keyframe.paths[keyframe.paths.length - 1];
                                    if (lastPath) {
                                        if (!lastPath.keyframePoints) {
                                            lastPath.keyframePoints = [];
                                        }
                                        lastPath.keyframePoints.push({
                                            index: finalIndex,
                                            frame: newFrame
                                        });
                                        lastPath.keyframePoints.sort((a, b) => a.index - b.index);
                                    }
                                }
                                
                                syncPathDataWidget(this);
                                this.updateThisNodeGraph?.();
                                return true;
                            }
                        }
                    }
                    return true;
                }
            }
            
            // 绘制模式：开始画笔绘制
            if (!this.properties.editMode) {
                if (this.properties.selectedKeyframe < 0 || 
                    this.properties.selectedKeyframe >= this.properties.keyframes.length) {
                    alert("请先选择一个关键帧");
                    return false;
                }

                let localX = e.canvasX - this.pos[0] - offsetX;
                let localY = e.canvasY - this.pos[1] - offsetY;

                let realX = localX / scale;
                let realY = localY / scale;

                realX = Math.max(0, Math.min(realX, canvasWidth - 1));
                realY = Math.max(0, Math.min(realY, canvasHeight - 1));

                // 画笔模式：拖拽绘制
                this.properties.isDrawing = true;
                this.properties.currentPath = [{ x: realX, y: realY }];
                this.properties.bezierPath = null; // 清除之前的贝塞尔路径

                this.capture = true;
                this.captureInput(true);
                return true;
            }
        }

        return false;
    };

    node.onMouseMove = function (e, _pos, canvas) {
        if (!this.capture) {
            return;
        }

        if (!this.properties.isDrawing) {
            return;
        }

        if (canvas.pointer.isDown === false) {
            this.onMouseUp(e);
            return;
        }
        this.valueUpdate(e);
    };

    node.valueUpdate = function (e) {
        if (!this.properties.isDrawing) {
            return;
        }

        const canvasWidth = this.properties.canvasWidth || 512;
        const canvasHeight = this.properties.canvasHeight || 512;
        let canvasAreaWidth = this.size[0] - shiftRight - shiftLeft;
        let canvasAreaHeight = this.size[1] - shiftLeft - shiftLeft - panelHeight - timelineHeight;

        const scaleX = canvasAreaWidth / canvasWidth;
        const scaleY = canvasAreaHeight / canvasHeight;
        const scale = Math.min(scaleX, scaleY);

        const scaledWidth = canvasWidth * scale;
        const scaledHeight = canvasHeight * scale;
        const offsetX = shiftLeft + (canvasAreaWidth - scaledWidth) / 2;
        const offsetY = shiftLeft + panelHeight + (canvasAreaHeight - scaledHeight) / 2;

        let mouseX = e.canvasX - this.pos[0] - offsetX;
        let mouseY = e.canvasY - this.pos[1] - offsetY;

        let realX = mouseX / scale;
        let realY = mouseY / scale;

        realX = Math.max(0, Math.min(realX, canvasWidth - 1));
        realY = Math.max(0, Math.min(realY, canvasHeight - 1));

        // 画笔模式：拖拽绘制
        if (!this.properties.editMode && this.properties.isDrawing) {
            const lastPoint = this.properties.currentPath[this.properties.currentPath.length - 1];
            const dist = Math.sqrt(
                Math.pow(realX - lastPoint.x, 2) +
                Math.pow(realY - lastPoint.y, 2)
            );

            // 添加点（最小距离阈值，避免点过密）
            if (dist > 1) {
                this.properties.currentPath.push({ x: realX, y: realY });
                this.updateThisNodeGraph?.();
            }
        }
    };

    node.onMouseUp = function () {
        if (!this.capture) {
            return;
        }

        if (this.properties.isDrawing && this.properties.currentPath.length > 0) {
            // 画笔模式：绘制完成后自动转换为贝塞尔曲线
            if (this.properties.currentPath.length >= 2) {
                // 1. 处理路径：平滑 + 转换为贝塞尔曲线
                const bezierPoints = processBrushPath(this.properties.currentPath, {
                    smoothSamples: 10,
                    enableSmoothing: true
                });
                
                // 2. 创建贝塞尔路径对象
                this.properties.bezierPath = {
                    points: bezierPoints,
                    keyframePoints: [] // 关键帧点列表 [{index, frame}, ...]
                };
                
                // 3. 自动添加起点和终点关键帧点
                // 起点使用当前选中的关键帧，终点使用下一个关键帧或总帧数-1
                if (this.properties.selectedKeyframe >= 0 && 
                    this.properties.selectedKeyframe < this.properties.keyframes.length) {
                    const currentFrame = this.properties.keyframes[this.properties.selectedKeyframe].frame;
                    const totalFrames = this.properties.totalFrames || 60;
                    
                    // 添加起点关键帧点
                    if (bezierPoints.length > 0) {
                        this.properties.bezierPath.keyframePoints.push({
                            index: 0,
                            frame: currentFrame
                        });
                    }
                    
                    // 添加终点关键帧点（如果路径有多个点）
                    if (bezierPoints.length > 1) {
                        // 计算终点关键帧：使用当前关键帧+1，但不超过总帧数-1
                        // 如果当前关键帧已经是最后一个，使用总帧数-1
                        let endFrame = currentFrame + 1;
                        if (endFrame >= totalFrames) {
                            endFrame = totalFrames - 1;
                        }
                        // 确保终点关键帧和起点不同
                        if (endFrame === currentFrame && totalFrames > 1) {
                            endFrame = totalFrames - 1;
                        }
                        
                        this.properties.bezierPath.keyframePoints.push({
                            index: bezierPoints.length - 1,
                            frame: endFrame
                        });
                    }
                }
                
                // 4. 进入编辑模式，允许添加/删除关键帧点
                this.properties.editMode = true;
                
                // 5. 保存到关键帧
                if (this.properties.selectedKeyframe >= 0 && 
                    this.properties.selectedKeyframe < this.properties.keyframes.length) {
                    
                    const keyframe = this.properties.keyframes[this.properties.selectedKeyframe];
                    
                    // 去重关键帧点：如果同一索引已存在关键帧点，只保留一个
                    let keyframePointsToSave = [];
                    if (this.properties.bezierPath.keyframePoints) {
                        const indexMap = new Map();
                        for (const kfPoint of this.properties.bezierPath.keyframePoints) {
                            // 如果该索引还没有关键帧点，或者当前关键帧点更靠后（索引更大），则使用当前
                            if (!indexMap.has(kfPoint.index) || indexMap.get(kfPoint.index).index < kfPoint.index) {
                                indexMap.set(kfPoint.index, kfPoint);
                            }
                        }
                        keyframePointsToSave = Array.from(indexMap.values());
                        // 按索引排序
                        keyframePointsToSave.sort((a, b) => a.index - b.index);
                    }
                    
                    keyframe.paths.push({
                        points: bezierPoints.map(p => ({
                            x: p.x,
                            y: p.y,
                            cp1: p.cp1 ? { x: p.cp1.x, y: p.cp1.y } : null,
                            cp2: p.cp2 ? { x: p.cp2.x, y: p.cp2.y } : null
                        })),
                        keyframePoints: keyframePointsToSave
                    });
                    
                    syncPathDataWidget(this);
                }
            }
            
            // 清除当前绘制路径（但保留bezierPath用于编辑）
            this.properties.currentPath = [];
        }

        this.properties.isDrawing = false;
        this.capture = false;
        this.captureInput(false);
        this.updateThisNodeGraph?.();
    };

    node.onSelected = function () {
        this.onMouseUp();
    };

    // 双击完成编辑（退出编辑模式）
    node.onDblClick = function (e) {
        if (this.properties.editMode && this.properties.bezierPath) {
            // 退出编辑模式
            this.properties.editMode = false;
            this.properties.bezierPath = null;
            this.updateThisNodeGraph?.();
            return true;
        }
        return false;
    };

    // Widget变化处理
    const originalOnWidgetChange = node.onWidgetChange;
    node.onWidgetChange = function (widget) {
        if (originalOnWidgetChange) {
            originalOnWidgetChange.apply(this, arguments);
        }

        if (!widget) {
            return;
        }

        if (widget.name === WIDGET_NAMES.CANVAS_WIDTH || widget.name === WIDGET_NAMES.CANVAS_HEIGHT) {
            const widthWidget = this.widgets.find(w => w.name === WIDGET_NAMES.CANVAS_WIDTH);
            const heightWidget = this.widgets.find(w => w.name === WIDGET_NAMES.CANVAS_HEIGHT);
            if (widthWidget && heightWidget && widthWidget.value && heightWidget.value) {
                this.updateCanvasSize(widthWidget.value, heightWidget.value);
            }
        }

        if (widget.name === WIDGET_NAMES.TOTAL_FRAMES) {
            this.properties.totalFrames = widget.value || 60;
            this.updateThisNodeGraph?.();
        }

        if (widget.name === WIDGET_NAMES.IMAGE_BASE64) {
            if (widget.value) {
                this.properties.imageBase64Data = widget.value;
                this.loadBackgroundImageFromBase64(widget.value);
            } else {
                this.properties.backgroundImageObj = null;
                this.properties.imageBase64Data = "";
                this.updateThisNodeGraph?.();
            }
        }
    };

    // 加载图片文件
    node.loadImageFromFile = function () {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = "image/*";
        input.onchange = e => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = event => {
                try {
                    const dataURL = event.target.result;
                    let base64String = dataURL;
                    if (dataURL.includes(",")) {
                        base64String = dataURL.split(",")[1];
                    }

                    this.properties.imageBase64Data = base64String;

                    const imageBase64Widget = this.widgets.find(w => w.name === WIDGET_NAMES.IMAGE_BASE64);
                    if (imageBase64Widget) {
                        imageBase64Widget.value = base64String;
                    }

                    this.loadBackgroundImageFromBase64(dataURL);

                    // 清空路径（可选）
                    // this.properties.keyframes = [];
                    // this.properties.currentPath = [];

                    console.log("Image loaded successfully, size:", base64String.length, "bytes");
                } catch (err) {
                    console.error("Error processing image file:", err);
                    alert("加载图片失败: " + err.message);
                }
            };
            reader.onerror = err => {
                console.error("Error reading file:", err);
                alert("读取文件失败");
            };
            reader.readAsDataURL(file);
        };
        input.click();
    };

    // 从base64加载背景图片
    node.loadBackgroundImageFromBase64 = function (base64String) {
        if (!base64String || base64String.trim() === "") {
            this.properties.backgroundImageObj = null;
            this.updateThisNodeGraph?.();
            return;
        }

        try {
            const img = new Image();
            img.onload = () => {
                this.properties.backgroundImageObj = img;
                // 自动设置画布尺寸为图片尺寸
                this.updateCanvasSize(img.width, img.height);
                this.updateThisNodeGraph?.();
            };
            img.onerror = err => {
                console.error("Error loading background image from base64:", err);
                this.properties.backgroundImageObj = null;
            };
            if (base64String.startsWith("data:")) {
                img.src = base64String;
            } else {
                img.src = "data:image/png;base64," + base64String;
            }
        } catch (err) {
            console.error("Error creating image from base64:", err);
            this.properties.backgroundImageObj = null;
        }
    };
}

// author.yichengup.CanvasAnimationPathBrush.interactions 2025.01.XX

