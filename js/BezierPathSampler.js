/**
 * BezierPathSampler.js - 贝塞尔曲线路径采样工具
 * 用于将钢笔工具绘制的贝塞尔曲线路径采样为点序列，供后端使用
 */

/**
 * 计算贝塞尔曲线上的点
 * @param {Object} p0 - 起点 {x, y}
 * @param {Object} p1 - 控制点1 {x, y}
 * @param {Object} p2 - 控制点2 {x, y}
 * @param {Object} p3 - 终点 {x, y}
 * @param {number} t - 插值参数 (0-1)
 * @returns {Object} 曲线上的点 {x, y}
 */
export function bezierPoint(p0, p1, p2, p3, t) {
    const mt = 1 - t;
    const mt2 = mt * mt;
    const mt3 = mt2 * mt;
    const t2 = t * t;
    const t3 = t2 * t;
    
    return {
        x: mt3 * p0.x + 3 * mt2 * t * p1.x + 3 * mt * t2 * p2.x + t3 * p3.x,
        y: mt3 * p0.y + 3 * mt2 * t * p1.y + 3 * mt * t2 * p2.y + t3 * p3.y
    };
}

/**
 * 计算两点之间的距离
 */
function distance(p1, p2) {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    return Math.sqrt(dx * dx + dy * dy);
}

/**
 * 估算贝塞尔曲线的长度（使用采样方法）
 */
function estimateBezierLength(p0, p1, p2, p3, samples = 20) {
    let length = 0;
    let prevPoint = bezierPoint(p0, p1, p2, p3, 0);
    
    for (let i = 1; i <= samples; i++) {
        const t = i / samples;
        const currentPoint = bezierPoint(p0, p1, p2, p3, t);
        length += distance(prevPoint, currentPoint);
        prevPoint = currentPoint;
    }
    
    return length;
}

/**
 * 采样贝塞尔曲线路径
 * 将钢笔工具绘制的路径（包含锚点和控制点）采样为密集的点序列
 * 
 * @param {Object} path - 钢笔路径对象 {points: [{x, y, cp1, cp2}, ...]}
 * @param {Object} options - 采样选项
 * @param {number} options.samplesPerSegment - 每个曲线段的采样点数（默认30）
 * @param {number} options.minSamples - 最小采样点数（默认2，用于直线）
 * @param {number} options.maxSamples - 最大采样点数（默认100）
 * @returns {Array} 采样后的点序列 [{x, y}, ...]
 */
export function sampleBezierPath(path, options = {}) {
    if (!path || !path.points || path.points.length === 0) {
        return [];
    }
    
    const {
        samplesPerSegment = 30,
        minSamples = 2,
        maxSamples = 100
    } = options;
    
    const sampledPoints = [];
    const points = path.points;
    
    // 如果只有一个点，直接返回
    if (points.length === 1) {
        return [{ x: points[0].x, y: points[0].y }];
    }
    
    // 遍历每两个相邻的锚点
    for (let i = 0; i < points.length - 1; i++) {
        const prev = points[i];
        const next = points[i + 1];
        
        // 判断是曲线还是直线
        const isCurve = prev.cp2 && next.cp1;
        
        if (isCurve) {
            // 曲线：采样贝塞尔曲线
            // 估算曲线长度，根据长度动态调整采样点数
            const estimatedLength = estimateBezierLength(
                { x: prev.x, y: prev.y },
                { x: prev.cp2.x, y: prev.cp2.y },
                { x: next.cp1.x, y: next.cp1.y },
                { x: next.x, y: next.y }
            );
            
            // 根据曲线长度动态调整采样点数
            // 每10像素至少1个采样点，最多maxSamples个
            let numSamples = Math.max(
                minSamples,
                Math.min(
                    maxSamples,
                    Math.ceil(estimatedLength / 10) || samplesPerSegment
                )
            );
            
            // 采样曲线
            for (let j = 0; j <= numSamples; j++) {
                const t = j / numSamples;
                const point = bezierPoint(
                    { x: prev.x, y: prev.y },
                    { x: prev.cp2.x, y: prev.cp2.y },
                    { x: next.cp1.x, y: next.cp1.y },
                    { x: next.x, y: next.y },
                    t
                );
                
                // 避免重复点（第一个点如果是前一段的最后一个点，跳过）
                if (j === 0 && sampledPoints.length > 0) {
                    const lastPoint = sampledPoints[sampledPoints.length - 1];
                    if (Math.abs(point.x - lastPoint.x) < 0.01 && 
                        Math.abs(point.y - lastPoint.y) < 0.01) {
                        continue;
                    }
                }
                
                sampledPoints.push(point);
            }
        } else {
            // 直线：只添加起点和终点（如果起点不是前一段的终点）
            if (i === 0 || sampledPoints.length === 0) {
                sampledPoints.push({ x: prev.x, y: prev.y });
            }
            
            // 添加终点
            sampledPoints.push({ x: next.x, y: next.y });
        }
    }
    
    return sampledPoints;
}

/**
 * 采样多个路径并合并
 * @param {Array} paths - 路径数组 [{points: [...]}, ...]
 * @param {Object} options - 采样选项
 * @returns {Array} 合并后的采样点序列
 */
export function sampleMultiplePaths(paths, options = {}) {
    if (!paths || paths.length === 0) {
        return [];
    }
    
    const allSampledPoints = [];
    
    for (const path of paths) {
        const sampled = sampleBezierPath(path, options);
        if (sampled.length > 0) {
            // 如果不是第一个路径，检查是否需要去重
            if (allSampledPoints.length > 0) {
                const firstPoint = sampled[0];
                const lastPoint = allSampledPoints[allSampledPoints.length - 1];
                // 如果第一个点和最后一个点相同，跳过第一个点
                if (Math.abs(firstPoint.x - lastPoint.x) < 0.01 && 
                    Math.abs(firstPoint.y - lastPoint.y) < 0.01) {
                    allSampledPoints.push(...sampled.slice(1));
                } else {
                    allSampledPoints.push(...sampled);
                }
            } else {
                allSampledPoints.push(...sampled);
            }
        }
    }
    
    return allSampledPoints;
}

// author.yichengup.BezierPathSampler 2025.01.XX

