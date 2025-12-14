/**
 * PathSmoother.js - 路径平滑和贝塞尔曲线转换工具
 * 将画笔绘制的路径自动转换为平滑的贝塞尔曲线
 */

/**
 * Catmull-Rom样条插值
 */
function catmullRomInterpolate(p0, p1, p2, p3, t) {
    const t2 = t * t;
    const t3 = t2 * t;
    
    const x = 0.5 * (
        (2 * p1.x) +
        (-p0.x + p2.x) * t +
        (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
        (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3
    );
    
    const y = 0.5 * (
        (2 * p1.y) +
        (-p0.y + p2.y) * t +
        (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
        (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3
    );
    
    return { x, y };
}

/**
 * 使用Catmull-Rom样条平滑路径
 * @param {Array} points - 原始路径点 [{x, y}, ...]
 * @param {number} samplesPerSegment - 每段采样点数
 * @returns {Array} 平滑后的路径点
 */
export function smoothPathWithCatmullRom(points, samplesPerSegment = 10) {
    if (points.length < 2) {
        return points;
    }
    
    if (points.length === 2) {
        return points;
    }
    
    const smoothed = [];
    
    // 对每两个相邻点之间的线段进行样条插值
    for (let i = 0; i < points.length - 1; i++) {
        // 获取四个控制点（用于Catmull-Rom样条）
        const p0 = points[Math.max(0, i - 1)];
        const p1 = points[i];
        const p2 = points[i + 1];
        const p3 = points[Math.min(points.length - 1, i + 2)];
        
        // 在p1和p2之间插入平滑点
        for (let j = 0; j < samplesPerSegment; j++) {
            const t = j / samplesPerSegment;
            const point = catmullRomInterpolate(p0, p1, p2, p3, t);
            smoothed.push(point);
        }
    }
    
    // 添加最后一个点
    smoothed.push(points[points.length - 1]);
    
    return smoothed;
}

/**
 * 将平滑路径转换为贝塞尔曲线
 * 使用自动拟合算法，将路径点转换为贝塞尔曲线锚点和控制点
 * @param {Array} smoothedPoints - 平滑后的路径点
 * @returns {Array} 贝塞尔曲线锚点 [{x, y, cp1, cp2}, ...]
 */
export function convertToBezierCurves(smoothedPoints) {
    if (smoothedPoints.length < 2) {
        return smoothedPoints.map(p => ({
            x: p.x,
            y: p.y,
            cp1: null,
            cp2: null
        }));
    }
    
    if (smoothedPoints.length === 2) {
        // 只有两个点，返回直线
        return smoothedPoints.map(p => ({
            x: p.x,
            y: p.y,
            cp1: null,
            cp2: null
        }));
    }
    
    const bezierPoints = [];
    
    // 第一个点：只有cp2（出控制点）
    const firstPoint = {
        x: smoothedPoints[0].x,
        y: smoothedPoints[0].y,
        cp1: null,
        cp2: null
    };
    
    // 计算第一个点的出控制点
    if (smoothedPoints.length > 1) {
        const dx = smoothedPoints[1].x - smoothedPoints[0].x;
        const dy = smoothedPoints[1].y - smoothedPoints[0].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const smoothFactor = 0.3;
        
        firstPoint.cp2 = {
            x: firstPoint.x + dx * smoothFactor,
            y: firstPoint.y + dy * smoothFactor
        };
    }
    
    bezierPoints.push(firstPoint);
    
    // 中间点：计算cp1和cp2
    for (let i = 1; i < smoothedPoints.length - 1; i++) {
        const prev = smoothedPoints[i - 1];
        const current = smoothedPoints[i];
        const next = smoothedPoints[i + 1];
        
        // 计算切线方向
        const dx1 = current.x - prev.x;
        const dy1 = current.y - prev.y;
        const dx2 = next.x - current.x;
        const dy2 = next.y - current.y;
        
        const dist1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);
        const dist2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);
        
        const smoothFactor = 0.3;
        
        const bezierPoint = {
            x: current.x,
            y: current.y,
            cp1: null,
            cp2: null
        };
        
        // 入控制点（cp1）
        if (dist1 > 0) {
            bezierPoint.cp1 = {
                x: current.x - dx1 * smoothFactor,
                y: current.y - dy1 * smoothFactor
            };
        }
        
        // 出控制点（cp2）
        if (dist2 > 0) {
            bezierPoint.cp2 = {
                x: current.x + dx2 * smoothFactor,
                y: current.y + dy2 * smoothFactor
            };
        }
        
        bezierPoints.push(bezierPoint);
    }
    
    // 最后一个点：只有cp1（入控制点）
    const lastPoint = {
        x: smoothedPoints[smoothedPoints.length - 1].x,
        y: smoothedPoints[smoothedPoints.length - 1].y,
        cp1: null,
        cp2: null
    };
    
    if (smoothedPoints.length > 1) {
        const prev = smoothedPoints[smoothedPoints.length - 2];
        const current = smoothedPoints[smoothedPoints.length - 1];
        const dx = current.x - prev.x;
        const dy = current.y - prev.y;
        const smoothFactor = 0.3;
        
        lastPoint.cp1 = {
            x: current.x - dx * smoothFactor,
            y: current.y - dy * smoothFactor
        };
    }
    
    bezierPoints.push(lastPoint);
    
    return bezierPoints;
}

/**
 * 完整的路径处理流程：平滑 + 转换为贝塞尔曲线
 * @param {Array} rawPoints - 原始画笔路径点
 * @param {Object} options - 选项
 * @returns {Array} 贝塞尔曲线锚点
 */
export function processBrushPath(rawPoints, options = {}) {
    const {
        smoothSamples = 10,
        enableSmoothing = true
    } = options;
    
    if (rawPoints.length < 2) {
        return rawPoints.map(p => ({
            x: p.x,
            y: p.y,
            cp1: null,
            cp2: null
        }));
    }
    
    // 1. 路径平滑（可选）
    let processedPoints = rawPoints;
    if (enableSmoothing && rawPoints.length > 2) {
        processedPoints = smoothPathWithCatmullRom(rawPoints, smoothSamples);
    }
    
    // 2. 转换为贝塞尔曲线
    const bezierPoints = convertToBezierCurves(processedPoints);
    
    return bezierPoints;
}

// author.yichengup.PathSmoother 2025.01.XX

