/**
 * 路径数据解析和序列化工具类（前端版本）
 * 与后端PathDataParser.py保持一致的接口和格式
 */

export class PathDataParser {
    static CURRENT_VERSION = "1.0";

    /**
     * 解析路径数据（自动识别新旧格式）
     * @param {string} pathData - 路径数据字符串（JSON格式或旧格式）
     * @returns {Object} 标准化的路径数据对象
     */
    static parse(pathData) {
        if (!pathData || !pathData.trim()) {
            return this._createEmptyData();
        }

        // 尝试解析为JSON格式（新格式）
        if (pathData.trim().startsWith('{')) {
            try {
                const data = JSON.parse(pathData);
                return this._normalizeJsonData(data);
            } catch (e) {
                // JSON解析失败，可能是旧格式，继续尝试旧格式解析
                console.warn("Failed to parse as JSON, trying legacy format:", e);
            }
        }

        // 解析旧格式（字符串格式）
        return this._parseLegacyFormat(pathData);
    }

    /**
     * 序列化路径数据
     * @param {Array} keyframes - 关键帧列表
     * @param {boolean} useJson - 是否使用JSON格式（默认true）
     * @param {Object} metadata - 可选的全局元数据
     * @returns {string} 序列化后的字符串
     */
    static serialize(keyframes, useJson = true, metadata = null) {
        if (useJson) {
            const data = {
                version: this.CURRENT_VERSION,
                keyframes: this._normalizeKeyframes(keyframes),
                metadata: metadata || {}
            };
            return JSON.stringify(data);
        } else {
            // 向后兼容：生成旧格式
            return this._serializeLegacyFormat(keyframes);
        }
    }

    /**
     * 验证路径数据格式
     * @param {string} pathData - 路径数据字符串
     * @returns {{isValid: boolean, errorMessage: string|null}}
     */
    static validate(pathData) {
        if (!pathData || !pathData.trim()) {
            return { isValid: true, errorMessage: null };
        }

        try {
            const data = this.parse(pathData);

            // 验证关键帧数据
            if (!data.keyframes) {
                return { isValid: false, errorMessage: "Missing 'keyframes' field" };
            }

            for (const kf of data.keyframes) {
                if (kf.frame === undefined) {
                    return { isValid: false, errorMessage: "Keyframe missing 'frame' field" };
                }
                if (!kf.points) {
                    return { isValid: false, errorMessage: `Keyframe ${kf.frame} missing 'points' field` };
                }

                // 验证点数据
                for (const point of kf.points) {
                    if (point.x === undefined || point.y === undefined) {
                        return { isValid: false, errorMessage: `Invalid point format in keyframe ${kf.frame}` };
                    }
                    if (isNaN(parseFloat(point.x)) || isNaN(parseFloat(point.y))) {
                        return { isValid: false, errorMessage: `Invalid point coordinates in keyframe ${kf.frame}` };
                    }
                }
            }

            return { isValid: true, errorMessage: null };
        } catch (e) {
            return { isValid: false, errorMessage: `Validation error: ${e.message}` };
        }
    }

    /**
     * 提取用于动画合成的关键帧数据
     * @param {Object} parsedData - 解析后的路径数据
     * @returns {Array} 关键帧列表 [{frame: int, points: [{x, y}, ...]}, ...]
     */
    static extractKeyframesForAnimation(parsedData) {
        return (parsedData.keyframes || []).map(kf => ({
            frame: kf.frame,
            points: kf.points || []
        }));
    }

    /**
     * 创建空的数据结构
     * @private
     */
    static _createEmptyData() {
        return {
            version: this.CURRENT_VERSION,
            keyframes: [],
            metadata: {}
        };
    }

    /**
     * 规范化JSON数据
     * @private
     */
    static _normalizeJsonData(data) {
        return {
            version: data.version || this.CURRENT_VERSION,
            keyframes: this._normalizeKeyframes(data.keyframes || []),
            metadata: data.metadata || {}
        };
    }

    /**
     * 规范化关键帧数据
     * @private
     */
    static _normalizeKeyframes(keyframes) {
        const normalized = keyframes.map(kf => ({
            frame: parseInt(kf.frame || 0),
            points: (kf.points || []).map(p => ({
                x: parseFloat(p.x || 0),
                y: parseFloat(p.y || 0)
            })),
            direction: kf.direction !== undefined ? parseInt(kf.direction) : 1, // 默认正向
            metadata: kf.metadata || {}
        }));

        // 按帧号排序
        normalized.sort((a, b) => a.frame - b.frame);
        return normalized;
    }

    /**
     * 解析旧格式：frame:points|frame:points
     * @private
     */
    static _parseLegacyFormat(pathData) {
        const keyframes = [];

        try {
            const keyframeStrings = pathData.split('|');
            for (const kfStr of keyframeStrings) {
                if (!kfStr.trim()) continue;

                const parts = kfStr.split(':');
                if (parts.length >= 2) {
                    const frame = parseInt(parts[0]);
                    const pointsStr = parts.slice(1).join(':'); // 处理points中可能有冒号的情况
                    const points = [];

                    if (pointsStr.trim()) {
                        const pointStrings = pointsStr.split(';');
                        for (const ptStr of pointStrings) {
                            if (!ptStr.trim()) continue;
                            const coords = ptStr.split(',');
                            if (coords.length >= 2) {
                                points.push({
                                    x: parseFloat(coords[0]),
                                    y: parseFloat(coords[1])
                                });
                            }
                        }
                    }

                    keyframes.push({
                        frame: frame,
                        points: points,
                        direction: 1, // 旧格式默认正向
                        metadata: {}
                    });
                }
            }

            // 按帧号排序
            keyframes.sort((a, b) => a.frame - b.frame);
        } catch (e) {
            throw new Error(`Error parsing legacy path data: ${e.message}`);
        }

        return {
            version: "0.0", // 标记为旧格式转换
            keyframes: keyframes,
            metadata: {}
        };
    }

    /**
     * 序列化为旧格式（向后兼容）
     * @private
     */
    static _serializeLegacyFormat(keyframes) {
        const keyframeStrings = [];

        for (const kf of [...keyframes].sort((a, b) => (a.frame || 0) - (b.frame || 0))) {
            const frame = kf.frame || 0;
            const points = kf.points || [];

            if (points.length > 0) {
                const pointsStr = points.map(p => `${p.x},${p.y}`).join(';');
                keyframeStrings.push(`${frame}:${pointsStr}`);
            }
        }

        return keyframeStrings.join('|');
    }
}

// author.yichengup.PathDataParser 2025.01.XX

