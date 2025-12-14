"""
路径数据解析和序列化工具类
支持新旧两种数据格式，提供统一的数据处理接口
"""
import json
from typing import List, Dict, Any, Optional

class PathDataParser:
    """
    路径数据解析器
    支持：
    1. 新格式（JSON）：结构化、版本化、可扩展
    2. 旧格式（字符串）：向后兼容
    """
    
    # 数据格式版本
    CURRENT_VERSION = "1.0"
    
    @staticmethod
    def parse(path_data: str) -> Dict[str, Any]:
        """
        解析路径数据（自动识别新旧格式）
        
        Args:
            path_data: 路径数据字符串（JSON格式或旧格式）
            
        Returns:
            标准化的路径数据字典：
            {
                "version": "1.0",
                "keyframes": [
                    {
                        "frame": 0,
                        "points": [{"x": 0.0, "y": 0.0}, ...],
                        "direction": 1,  # 可选：1=正向, -1=反向
                        "metadata": {}  # 可选：扩展元数据
                    },
                    ...
                ],
                "metadata": {}  # 全局元数据
            }
        """
        if not path_data or not path_data.strip():
            return PathDataParser._create_empty_data()
        
        # 尝试解析为JSON格式（新格式）
        if path_data.strip().startswith('{'):
            try:
                data = json.loads(path_data)
                # 验证并规范化JSON数据
                return PathDataParser._normalize_json_data(data)
            except json.JSONDecodeError:
                # JSON解析失败，可能是旧格式，继续尝试旧格式解析
                pass
        
        # 解析旧格式（字符串格式）
        return PathDataParser._parse_legacy_format(path_data)
    
    @staticmethod
    def serialize(keyframes: List[Dict[str, Any]], 
                  use_json: bool = True,
                  metadata: Optional[Dict[str, Any]] = None) -> str:
        """
        序列化路径数据
        
        Args:
            keyframes: 关键帧列表
            use_json: 是否使用JSON格式（默认True）
            metadata: 可选的全局元数据
            
        Returns:
            序列化后的字符串
        """
        if use_json:
            data = {
                "version": PathDataParser.CURRENT_VERSION,
                "keyframes": PathDataParser._normalize_keyframes(keyframes),
                "metadata": metadata or {}
            }
            return json.dumps(data, separators=(',', ':'))  # 紧凑格式
        else:
            # 向后兼容：生成旧格式
            return PathDataParser._serialize_legacy_format(keyframes)
    
    @staticmethod
    def validate(path_data: str) -> tuple[bool, Optional[str]]:
        """
        验证路径数据格式
        
        Returns:
            (is_valid, error_message)
        """
        if not path_data or not path_data.strip():
            return True, None
        
        try:
            data = PathDataParser.parse(path_data)
            
            # 验证关键帧数据
            if "keyframes" not in data:
                return False, "Missing 'keyframes' field"
            
            for kf in data["keyframes"]:
                if "frame" not in kf:
                    return False, "Keyframe missing 'frame' field"
                if "points" not in kf:
                    return False, f"Keyframe {kf.get('frame')} missing 'points' field"
                
                # 验证点数据
                for point in kf["points"]:
                    if "x" not in point or "y" not in point:
                        return False, f"Invalid point format in keyframe {kf.get('frame')}"
                    try:
                        float(point["x"])
                        float(point["y"])
                    except (ValueError, TypeError):
                        return False, f"Invalid point coordinates in keyframe {kf.get('frame')}"
            
            return True, None
        except Exception as e:
            return False, f"Validation error: {str(e)}"
    
    @staticmethod
    def _create_empty_data() -> Dict[str, Any]:
        """创建空的数据结构"""
        return {
            "version": PathDataParser.CURRENT_VERSION,
            "keyframes": [],
            "metadata": {}
        }
    
    @staticmethod
    def _normalize_json_data(data: Dict[str, Any]) -> Dict[str, Any]:
        """规范化JSON数据，确保所有必需字段存在"""
        normalized = {
            "version": data.get("version", PathDataParser.CURRENT_VERSION),
            "keyframes": PathDataParser._normalize_keyframes(data.get("keyframes", [])),
            "metadata": data.get("metadata", {})
        }
        return normalized
    
    @staticmethod
    def _normalize_keyframes(keyframes: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """规范化关键帧数据"""
        normalized = []
        for kf in keyframes:
            normalized_kf = {
                "frame": int(kf.get("frame", 0)),
                "points": kf.get("points", []),
                "direction": kf.get("direction", 1),  # 默认正向
                "metadata": kf.get("metadata", {})
            }
            # 确保points格式正确
            normalized_kf["points"] = [
                {"x": float(p.get("x", 0)), "y": float(p.get("y", 0))}
                for p in normalized_kf["points"]
            ]
            normalized.append(normalized_kf)
        
        # 按帧号排序
        normalized.sort(key=lambda kf: kf["frame"])
        return normalized
    
    @staticmethod
    def _parse_legacy_format(path_data: str) -> Dict[str, Any]:
        """
        解析旧格式：frame:points|frame:points
        points格式：x1,y1;x2,y2;...
        """
        keyframes = []
        
        try:
            keyframe_strings = path_data.split('|')
            for kf_str in keyframe_strings:
                if not kf_str.strip():
                    continue
                
                parts = kf_str.split(':')
                if len(parts) >= 2:
                    frame = int(parts[0])
                    points_str = ':'.join(parts[1:])  # 处理points中可能有冒号的情况
                    points = []
                    
                    if points_str.strip():
                        point_strings = points_str.split(';')
                        for pt_str in point_strings:
                            if not pt_str.strip():
                                continue
                            coords = pt_str.split(',')
                            if len(coords) >= 2:
                                points.append({
                                    'x': float(coords[0]),
                                    'y': float(coords[1])
                                })
                    
                    keyframes.append({
                        'frame': frame,
                        'points': points,
                        'direction': 1,  # 旧格式默认正向
                        'metadata': {}
                    })
            
            # 按帧号排序
            keyframes.sort(key=lambda kf: kf['frame'])
        except Exception as e:
            raise ValueError(f"Error parsing legacy path data: {e}")
        
        return {
            "version": "0.0",  # 标记为旧格式转换
            "keyframes": keyframes,
            "metadata": {}
        }
    
    @staticmethod
    def _serialize_legacy_format(keyframes: List[Dict[str, Any]]) -> str:
        """序列化为旧格式（向后兼容）"""
        keyframe_strings = []
        
        for kf in sorted(keyframes, key=lambda kf: kf.get("frame", 0)):
            frame = kf.get("frame", 0)
            points = kf.get("points", [])
            
            if points:
                points_str = ';'.join([f"{p['x']},{p['y']}" for p in points])
                keyframe_strings.append(f"{frame}:{points_str}")
        
        return '|'.join(keyframe_strings)
    
    @staticmethod
    def extract_keyframes_for_animation(parsed_data: Dict[str, Any]) -> List[Dict[str, Any]]:
        """
        提取用于动画合成的关键帧数据
        返回格式：[{frame: int, points: [{x, y}, ...]}, ...]
        """
        return [
            {
                "frame": kf["frame"],
                "points": kf["points"]
            }
            for kf in parsed_data.get("keyframes", [])
        ]

# author.yichengup.PathDataParser 2025.01.XX

