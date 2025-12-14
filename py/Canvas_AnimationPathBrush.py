import torch
import numpy as np
from PIL import Image
import io
import base64
import nodes
import sys
import os

# 导入PathDataParser（支持相对导入和绝对导入）
try:
    from .PathDataParser import PathDataParser
except ImportError:
    # 如果相对导入失败，尝试绝对导入
    current_dir = os.path.dirname(os.path.abspath(__file__))
    if current_dir not in sys.path:
        sys.path.insert(0, current_dir)
    from PathDataParser import PathDataParser

class ycCanvasAnimationPathBrush:
    """
    动画路径绘制节点（画笔版本）：
    - 支持任意宽高比的画布
    - 使用画笔绘制路径（更自然）
    - 支持多个关键帧
    - 支持图片导入和输出
    - 输出路径数据供动画合成节点使用
    
    后端职责：
    - 数据验证和规范化
    - 格式转换（旧格式自动升级为新格式）
    - 路径数据预处理和优化
    - 生成预览图像
    """
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "canvas_width": ("INT", {"default": 512, "min": 64, "max": 4096}),
                "canvas_height": ("INT", {"default": 512, "min": 64, "max": 4096}),
                "path_data": ("STRING", {"default": "", "multiline": True}),
            },
            "optional": {
                "total_frames": ("INT", {"default": 60, "min": 1, "max": 1000}),
                "auto_normalize": ("BOOLEAN", {"default": True, "tooltip": "自动规范化路径数据（去除重复点、优化路径）"}),
            },
        }

    RETURN_TYPES = ("STRING", "INT", "INT", "INT", "IMAGE")
    RETURN_NAMES = ("path_data", "canvas_width", "canvas_height", "total_frames", "image")

    FUNCTION = "main"
    CATEGORY = 'YCNode/Animation'

    def main(self, canvas_width, canvas_height, path_data, total_frames=60, auto_normalize=True):
        """
        主处理函数
        
        Args:
            canvas_width: 画布宽度
            canvas_height: 画布高度
            path_data: 路径数据（支持新旧格式）
            total_frames: 总帧数
            auto_normalize: 是否自动规范化路径数据
            
        Returns:
            (path_data, canvas_width, canvas_height, total_frames, image)
        """
        # 1. 验证路径数据格式
        is_valid, error_msg = PathDataParser.validate(path_data)
        if not is_valid:
            print(f"Warning: Path data validation failed: {error_msg}")
            # 即使验证失败，也尝试继续处理（向后兼容）
        
        # 2. 解析路径数据（自动识别新旧格式）
        try:
            parsed_data = PathDataParser.parse(path_data)
        except Exception as e:
            print(f"Error parsing path data: {e}")
            # 如果解析失败，返回空数据
            parsed_data = PathDataParser._create_empty_data()
        
        # 3. 数据预处理和优化
        if auto_normalize and parsed_data.get("keyframes"):
            parsed_data = self._normalize_path_data(parsed_data, canvas_width, canvas_height)
        
        # 4. 序列化为新格式（JSON）
        # 如果原始数据是旧格式，自动升级为新格式
        normalized_path_data = PathDataParser.serialize(
            parsed_data["keyframes"],
            use_json=True,
            metadata=parsed_data.get("metadata", {})
        )
        
        # 5. 创建预览图像（可选：在画布上绘制路径预览）
        output_image = self._create_preview_image(
            parsed_data, canvas_width, canvas_height
        )
        
        return (normalized_path_data, canvas_width, canvas_height, total_frames, output_image)
    
    def _normalize_path_data(self, parsed_data: dict, canvas_width: int, canvas_height: int) -> dict:
        """
        规范化路径数据：
        - 去除重复点
        - 限制坐标在画布范围内
        - 优化路径点密度
        """
        normalized_keyframes = []
        
        for kf in parsed_data.get("keyframes", []):
            points = kf.get("points", [])
            if not points:
                continue
            
            # 去除重复点（距离小于阈值的点）
            normalized_points = []
            min_distance = 0.5  # 最小点间距
            
            for point in points:
                x = max(0, min(float(point.get("x", 0)), canvas_width - 1))
                y = max(0, min(float(point.get("y", 0)), canvas_height - 1))
                
                # 检查是否与上一个点太近
                if normalized_points:
                    last_point = normalized_points[-1]
                    dx = x - last_point["x"]
                    dy = y - last_point["y"]
                    distance = (dx * dx + dy * dy) ** 0.5
                    
                    if distance < min_distance:
                        continue  # 跳过太近的点
                
                normalized_points.append({"x": x, "y": y})
            
            # 至少保留起点和终点
            if len(normalized_points) == 0 and points:
                first_point = points[0]
                normalized_points.append({
                    "x": max(0, min(float(first_point.get("x", 0)), canvas_width - 1)),
                    "y": max(0, min(float(first_point.get("y", 0)), canvas_height - 1))
                })
            
            if normalized_points:
                normalized_keyframes.append({
                    "frame": kf.get("frame", 0),
                    "points": normalized_points,
                    "direction": kf.get("direction", 1),
                    "metadata": kf.get("metadata", {})
                })
        
        return {
            "version": parsed_data.get("version", PathDataParser.CURRENT_VERSION),
            "keyframes": normalized_keyframes,
            "metadata": parsed_data.get("metadata", {})
        }
    
    def _create_preview_image(self, parsed_data: dict, canvas_width: int, canvas_height: int) -> torch.Tensor:
        """
        创建预览图像（在画布上绘制路径）
        目前返回空白图像，未来可以添加路径可视化
        """
        # 创建空白图片输出
        output_image = torch.zeros((1, canvas_height, canvas_width, 3), dtype=torch.float32)
        
        # TODO: 未来可以在这里绘制路径预览
        # 例如：使用PIL绘制路径线条
        
        return output_image

# author.yichengup.CanvasAnimationPathBrush 2025.01.XX

NODE_CLASS_MAPPINGS = {
    "ycCanvasAnimationPathBrush": ycCanvasAnimationPathBrush,
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "ycCanvasAnimationPathBrush": "Canvas Animation Path Brush"
}

