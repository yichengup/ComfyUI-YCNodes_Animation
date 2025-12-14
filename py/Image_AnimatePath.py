import torch
import numpy as np
from PIL import Image
import nodes
import math
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

class ycImageAnimatePath:
    """
    动画路径合成节点：
    - 接收路径数据和前景/背景图像
    - 根据路径数据让前景图沿着路径运动
    - 输出动画帧序列
    """
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "background_image": ("IMAGE",),
                "path_data": ("STRING", {"default": "", "multiline": True}),
                "canvas_width": ("INT", {"default": 512}),
                "canvas_height": ("INT", {"default": 512}),
                "total_frames": ("INT", {"default": 60, "min": 1, "max": 1000}),
                "foreground_scale": ("FLOAT", {"default": 1.0, "min": 0.1, "max": 5.0, "step": 0.1}),
                "center_anchor": ("BOOLEAN", {"default": True, "tooltip": "前景图是否以中心为锚点"}),
                "smooth_path": ("BOOLEAN", {"default": True, "tooltip": "是否启用路径平滑（样条插值），消除抖动"}),
            },
            "optional": {
                "foreground_image": ("IMAGE", {"tooltip": "单个前景图。如果提供了foreground_images，此参数将被忽略"}),
                "foreground_images": ("IMAGE", {"tooltip": "批次前景图，支持多个不同尺寸的图片。如果提供，将优先使用批次模式，并根据keyframe_image_map在不同关键帧使用不同的前景图"}),
                "effects_data": ("STRING", {"default": "", "multiline": True, "tooltip": "动画效果数据，格式：keyframe:scale_x,scale_y,rotation,flip_x,flip_y,opacity|..."}),
                "foreground_mask": ("MASK", {"tooltip": "单个前景图遮罩，白色区域保留，黑色区域透明。遮罩会在应用动画效果之前应用到前景图（仅在单个前景图模式下使用）"}),
                "foreground_masks": ("MASK", {"tooltip": "批次遮罩，可选。如果提供，每个遮罩对应foreground_images中的一个图片（仅在批次模式下使用）"}),
                "keyframe_image_map": ("STRING", {"default": "", "multiline": True, "tooltip": "关键帧图片映射，格式：keyframe:image_index|keyframe:image_index。例如：0:0|10:1|20:2 表示KF0使用第0个图片，KF10使用第1个图片，KF20使用第2个图片（仅在批次模式下使用）"}),
                "normalize_image_size": (["max", "first", "custom", "original"], {"default": "max", "tooltip": "统一尺寸模式：max=最大尺寸，first=第一个图片尺寸，custom=自定义，original=保持原始尺寸（仅在批次模式下使用）"}),
                "custom_image_size": ("INT", {"default": 512, "min": 64, "max": 4096, "tooltip": "自定义统一尺寸（当normalize_image_size=custom时使用，仅在批次模式下使用）"}),
            },
        }

    RETURN_TYPES = ("IMAGE", "MASK")
    RETURN_NAMES = ("animated_frames", "animated_masks")
    FUNCTION = "animate"
    CATEGORY = 'YCNode/Animation'

    def animate(self, background_image, path_data, canvas_width, canvas_height, 
                total_frames, foreground_scale, center_anchor, smooth_path=True, 
                foreground_image=None, foreground_images=None, effects_data="", 
                foreground_mask=None, foreground_masks=None, keyframe_image_map="", 
                normalize_image_size="max", custom_image_size=512):
        """
        动画路径合成
        
        前景图输入模式：
        1. 批次模式（优先）：如果提供了foreground_images，使用批次模式
        2. 单个模式：如果只提供了foreground_image，使用单个前景图
        3. 错误：如果两者都未提供，抛出异常
        """
        # 验证前景图输入
        use_batch_images = foreground_images is not None and len(foreground_images) > 0
        use_single_image = foreground_image is not None and len(foreground_image) > 0
        
        if not use_batch_images and not use_single_image:
            raise ValueError("必须提供至少一个前景图：foreground_image 或 foreground_images")
        
        # 解析路径数据（使用新的PathDataParser，支持新旧格式）
        parsed_data = PathDataParser.parse(path_data)
        keyframes = PathDataParser.extract_keyframes_for_animation(parsed_data)
        
        # 解析效果数据
        effects_dict = self._parse_effects_data(effects_data)
        
        # 解析关键帧图片映射（仅在批次模式下使用）
        keyframe_image_map_dict = {}
        if use_batch_images:
            keyframe_image_map_dict = self._parse_keyframe_image_map(keyframe_image_map)
        
        if len(keyframes) == 0:
            print("Warning: No keyframes found in path data, returning static image")
            # 如果没有关键帧，返回静态图像
            return (background_image,)
        
        # 转换为PIL图像进行处理
        bg_pil = self._tensor_to_pil(background_image[0])
        
        # 处理前景图
        foreground_image_list = None
        foreground_mask_list = None
        original_fg_pil = None  # 单个前景图模式使用
        
        if use_batch_images:
            # 转换批次前景图为PIL图像列表
            foreground_image_list = []
            for i in range(len(foreground_images)):
                fg_pil_item = self._tensor_to_pil(foreground_images[i])
                foreground_image_list.append(fg_pil_item)
            
            # 处理批次遮罩（如果提供）
            if foreground_masks is not None and len(foreground_masks) > 0:
                foreground_mask_list = []
                for i in range(len(foreground_masks)):
                    mask_tensor = foreground_masks[i]
                    foreground_mask_list.append(mask_tensor)
            
            # 统一尺寸处理
            foreground_image_list, foreground_mask_list = self._normalize_images_to_same_size(
                foreground_image_list, foreground_mask_list, normalize_image_size, custom_image_size
            )
            
            # 应用遮罩到每个前景图
            if foreground_mask_list is not None:
                for i in range(len(foreground_image_list)):
                    if i < len(foreground_mask_list):
                        foreground_image_list[i] = self._apply_mask(foreground_image_list[i], foreground_mask_list[i])
        else:
            # 使用单个前景图模式
            fg_pil = self._tensor_to_pil(foreground_image[0])
            
            # 应用遮罩（如果提供）- 在应用动画效果之前
            if foreground_mask is not None:
                fg_pil = self._apply_mask(fg_pil, foreground_mask)
            
            # 保存原始前景图（用于每帧变换）
            original_fg_pil = fg_pil.copy()
            
            # 调整前景图基础尺寸
            if foreground_scale != 1.0:
                new_width = int(fg_pil.width * foreground_scale)
                new_height = int(fg_pil.height * foreground_scale)
                fg_pil = fg_pil.resize((new_width, new_height), Image.LANCZOS)
                original_fg_pil = fg_pil.copy()
        
        # 确保背景图尺寸匹配画布
        if bg_pil.size != (canvas_width, canvas_height):
            bg_pil = bg_pil.resize((canvas_width, canvas_height), Image.LANCZOS)
        
        # 生成所有帧
        output_frames = []
        output_masks = []
        for frame_idx in range(total_frames):
            # 计算当前帧的位置（使用方案3A：样条平滑 + 路径长度插值）
            position, path_kf_info = self._interpolate_position(keyframes, frame_idx, total_frames, smooth_path)
            
            # 计算当前帧的效果参数（基于路径关键帧）
            effects = self._interpolate_effects_based_on_path(
                effects_dict, frame_idx, total_frames, keyframes, path_kf_info
            )
            
            # 选择当前帧使用的前景图
            if use_batch_images:
                # 根据关键帧图片映射选择前景图
                current_fg_pil = self._get_foreground_image_for_frame(
                    frame_idx, keyframe_image_map_dict, foreground_image_list, foreground_scale
                )
            else:
                # 使用单个前景图
                current_fg_pil = original_fg_pil.copy()
            
            # 调试输出：打印关键帧和效果信息（仅在特定帧打印，避免输出过多）
            # if frame_idx in [0, 27, 30, 32, 35, 50, 59]:
            #     print(f"Frame {frame_idx}: path_kf={path_kf_info.get('prev_kf_frame')}->{path_kf_info.get('next_kf_frame')}, "
            #           f"t={path_kf_info.get('t', 0):.2f}, rotation={effects['rotation']:.1f}")
            
            if position is None:
                # 如果无法计算位置，使用背景图和空遮罩
                frame_pil = bg_pil.copy()
                mask_pil = Image.new('L', (canvas_width, canvas_height), 0)
            else:
                # 预先变换前景图（缩放、旋转、翻转、透明度）
                fg_rgba = self._transform_fg_with_effects(current_fg_pil, effects)
                
                # 计算粘贴位置
                if center_anchor:
                    paste_x = int(position['x'] - fg_rgba.width / 2)
                    paste_y = int(position['y'] - fg_rgba.height / 2)
                else:
                    paste_x = int(position['x'])
                    paste_y = int(position['y'])
                
                # 合成图像
                frame_pil = bg_pil.copy().convert("RGBA")
                frame_pil.paste(fg_rgba, (paste_x, paste_y), fg_rgba)
                frame_pil = frame_pil.convert("RGB")
                
                # 生成遮罩（白色可见）
                mask_pil = Image.new('L', (canvas_width, canvas_height), 0)
                fg_alpha = fg_rgba.split()[3]
                mask_pil.paste(fg_alpha, (paste_x, paste_y))
            
            # 转换为tensor
            frame_tensor = self._pil_to_tensor(frame_pil)
            mask_tensor = torch.from_numpy(np.array(mask_pil).astype(np.float32) / 255.0).unsqueeze(0)
            output_frames.append(frame_tensor)
            output_masks.append(mask_tensor)
        
        # 堆叠成批次
        output_batch = torch.cat(output_frames, dim=0)
        mask_batch = torch.cat(output_masks, dim=0)
        return (output_batch, mask_batch)
    
    def _parse_path_data(self, path_data):
        """
        解析路径数据字符串（向后兼容方法）
        注意：新代码应直接使用 PathDataParser.parse()
        """
        # 使用新的PathDataParser解析
        parsed_data = PathDataParser.parse(path_data)
        return PathDataParser.extract_keyframes_for_animation(parsed_data)
    
    def _catmull_rom_interpolate(self, p0, p1, p2, p3, t):
        """
        Catmull-Rom样条插值
        p0, p1, p2, p3: 四个控制点
        t: 插值参数 (0-1)
        返回插值点
        """
        # Catmull-Rom样条公式
        t2 = t * t
        t3 = t2 * t
        
        x = 0.5 * (
            (2 * p1['x']) +
            (-p0['x'] + p2['x']) * t +
            (2 * p0['x'] - 5 * p1['x'] + 4 * p2['x'] - p3['x']) * t2 +
            (-p0['x'] + 3 * p1['x'] - 3 * p2['x'] + p3['x']) * t3
        )
        
        y = 0.5 * (
            (2 * p1['y']) +
            (-p0['y'] + p2['y']) * t +
            (2 * p0['y'] - 5 * p1['y'] + 4 * p2['y'] - p3['y']) * t2 +
            (-p0['y'] + 3 * p1['y'] - 3 * p2['y'] + p3['y']) * t3
        )
        
        return {'x': x, 'y': y}
    
    def _smooth_path_with_spline(self, points, samples_per_segment=10):
        """
        使用Catmull-Rom样条平滑路径点
        points: 原始路径点列表
        samples_per_segment: 每两个原始点之间插入的平滑点数量
        返回平滑后的路径点列表
        """
        if len(points) < 2:
            return points
        
        if len(points) == 2:
            # 只有两个点，直接返回
            return points
        
        smoothed = []
        
        # 对于每两个相邻点之间的线段进行样条插值
        for i in range(len(points) - 1):
            # 获取四个控制点（用于Catmull-Rom样条）
            # 使用边界处理：如果超出范围，使用端点
            p0 = points[max(0, i - 1)]
            p1 = points[i]
            p2 = points[i + 1]
            p3 = points[min(len(points) - 1, i + 2)]
            
            # 在p1和p2之间插入平滑点
            for j in range(samples_per_segment):
                t = j / samples_per_segment
                point = self._catmull_rom_interpolate(p0, p1, p2, p3, t)
                smoothed.append(point)
        
        # 添加最后一个点
        smoothed.append(points[-1])
        
        return smoothed
    
    def _calculate_path_length(self, points):
        """
        计算路径总长度
        points: 路径点列表
        返回总长度
        """
        if len(points) < 2:
            return 0.0
        
        total_length = 0.0
        for i in range(len(points) - 1):
            dx = points[i + 1]['x'] - points[i]['x']
            dy = points[i + 1]['y'] - points[i]['y']
            total_length += math.sqrt(dx * dx + dy * dy)
        
        return total_length
    
    def _interpolate_along_path_by_length(self, prev_points, next_points, t):
        """
        方案A：路径长度归一化插值
        在prev_points和next_points组成的路径上，根据插值比例t找到对应位置
        t: 插值比例 (0-1)
        返回路径上的点坐标
        """
        # 连接两个关键帧的路径点
        if len(prev_points) == 0 and len(next_points) == 0:
            return None
        
        if len(prev_points) == 0:
            full_path = next_points
        elif len(next_points) == 0:
            full_path = prev_points
        else:
            # 连接路径：prev_points + next_points
            # 如果prev_points的最后一个点和next_points的第一个点相同，去重
            if (len(prev_points) > 0 and len(next_points) > 0 and
                abs(prev_points[-1]['x'] - next_points[0]['x']) < 0.01 and
                abs(prev_points[-1]['y'] - next_points[0]['y']) < 0.01):
                # 去重：只保留一个点
                full_path = prev_points + next_points[1:]
            else:
                full_path = prev_points + next_points
        
        if len(full_path) < 2:
            return full_path[0] if full_path else None
        
        # 计算路径总长度
        total_length = self._calculate_path_length(full_path)
        
        if total_length == 0:
            return full_path[0]
        
        # 根据t计算目标长度
        target_length = total_length * t
        
        # 沿着路径找到对应位置
        current_length = 0.0
        for i in range(len(full_path) - 1):
            dx = full_path[i + 1]['x'] - full_path[i]['x']
            dy = full_path[i + 1]['y'] - full_path[i]['y']
            segment_length = math.sqrt(dx * dx + dy * dy)
            
            if current_length + segment_length >= target_length:
                # 在这个线段上插值
                if segment_length > 0:
                    local_t = (target_length - current_length) / segment_length
                else:
                    local_t = 0.0
                
                x = full_path[i]['x'] * (1 - local_t) + full_path[i + 1]['x'] * local_t
                y = full_path[i]['y'] * (1 - local_t) + full_path[i + 1]['y'] * local_t
                return {'x': x, 'y': y}
            
            current_length += segment_length
        
        # 如果t=1.0，返回最后一个点
        return full_path[-1]
    
    def _interpolate_position(self, keyframes, current_frame, total_frames, smooth_path=True):
        """
        在关键帧之间插值计算当前位置
        使用方案3A：样条平滑 + 路径长度归一化插值
        返回路径上的一个点坐标 (x, y) 和路径关键帧信息
        """
        path_kf_info = {
            'prev_kf_frame': None,
            'next_kf_frame': None,
            't': 0.0
        }
        
        if len(keyframes) == 0:
            return None, path_kf_info
        
        # 如果只有一個關鍵幀，返回該關鍵幀的第一個點
        if len(keyframes) == 1:
            kf = keyframes[0]
            if len(kf['points']) > 0:
                path_kf_info['prev_kf_frame'] = kf['frame']
                path_kf_info['next_kf_frame'] = kf['frame']
                path_kf_info['t'] = 0.0
                return kf['points'][0].copy(), path_kf_info
            return None, path_kf_info
        
        # 找到当前帧所在的关键帧区间
        prev_kf = None
        next_kf = None
        
        for i, kf in enumerate(keyframes):
            if kf['frame'] <= current_frame:
                prev_kf = kf
                if i + 1 < len(keyframes):
                    next_kf = keyframes[i + 1]
            else:
                break
        
        # 如果当前帧在所有关键帧之前，使用第一个关键帧
        if prev_kf is None:
            prev_kf = keyframes[0]
            if len(keyframes) > 1:
                next_kf = keyframes[1]
        
        # 如果当前帧在所有关键帧之后，停留在最后一个关键帧的终点位置
        # 不循环回到起点，避免动画循环
        if next_kf is None:
            # 使用最后一个关键帧，停留在终点位置
            prev_kf = keyframes[-1]
            next_kf = keyframes[-1]  # 设置为同一个关键帧，t=1.0时返回终点
        
        # 保存路径关键帧信息
        path_kf_info['prev_kf_frame'] = prev_kf['frame']
        path_kf_info['next_kf_frame'] = next_kf['frame']
        
        # 计算插值比例
        if prev_kf['frame'] == next_kf['frame']:
            t = 0.0
        else:
            t = (current_frame - prev_kf['frame']) / (next_kf['frame'] - prev_kf['frame'])
        t = max(0.0, min(1.0, t))  # 限制在0-1之间
        path_kf_info['t'] = t
        
        # 获取路径点
        prev_points = prev_kf['points']
        next_points = next_kf['points']
        
        if len(prev_points) == 0 and len(next_points) == 0:
            return None, path_kf_info
        
        # 如果某个关键帧没有点，使用另一个关键帧的点
        if len(prev_points) == 0:
            if len(next_points) > 0:
                return next_points[0].copy(), path_kf_info
            return None, path_kf_info
        
        if len(next_points) == 0:
            if len(prev_points) > 0:
                # 如果只有prev_points，使用最后一个点（终点位置）
                # 这样当超过最后一个关键帧时，会停留在终点，而不是循环
                if smooth_path and len(prev_points) > 1:
                    # 平滑路径后使用最后一个点（终点）
                    smoothed = self._smooth_path_with_spline(prev_points)
                    return smoothed[-1].copy(), path_kf_info
                return prev_points[-1].copy(), path_kf_info
            return None, path_kf_info
        
        # 检查两个关键帧是否使用相同的路径（路径点数量相同且起点终点相同）
        # 如果使用相同路径，应该沿着同一个路径插值，根据关键帧编号的比例计算路径上的位置
        same_path = False
        if (len(prev_points) == len(next_points) and len(prev_points) > 0):
            # 检查起点和终点是否相同（允许小的误差）
            start_same = (abs(prev_points[0]['x'] - next_points[0]['x']) < 0.01 and
                         abs(prev_points[0]['y'] - next_points[0]['y']) < 0.01)
            end_same = (abs(prev_points[-1]['x'] - next_points[-1]['x']) < 0.01 and
                       abs(prev_points[-1]['y'] - next_points[-1]['y']) < 0.01)
            if start_same and end_same:
                same_path = True
        
        # 方案3A：样条平滑 + 路径长度归一化插值
        if smooth_path:
            # 1. 路径平滑（样条插值）
            prev_points_smooth = self._smooth_path_with_spline(prev_points) if len(prev_points) > 1 else prev_points
            next_points_smooth = self._smooth_path_with_spline(next_points) if len(next_points) > 1 else next_points
            
            if same_path:
                # 如果两个关键帧使用相同路径，沿着同一个路径插值
                # 根据关键帧编号的比例计算路径上的位置
                # 例如：KF0在起点(t=0)，KF25在25/45位置(t=25/45)，KF45在终点(t=1)
                # 需要找到整个路径的起点和终点关键帧（所有关键帧中的最小和最大帧号）
                prev_frame = prev_kf['frame']
                next_frame = next_kf['frame']
                
                # 找到所有关键帧中的最小和最大帧号（整个路径的起点和终点）
                first_frame = min(kf['frame'] for kf in keyframes)
                last_frame = max(kf['frame'] for kf in keyframes)
                
                if prev_frame == next_frame:
                    # 如果关键帧相同，根据关键帧在整个路径上的位置计算
                    if last_frame > first_frame:
                        path_t = (prev_frame - first_frame) / (last_frame - first_frame)
                        path_t = max(0.0, min(1.0, path_t))
                    else:
                        path_t = 0.0
                else:
                    # 计算当前帧在整个路径上的位置
                    if last_frame > first_frame:
                        # 当前帧在整个路径上的位置
                        current_frame_pos = prev_frame + (next_frame - prev_frame) * t
                        # 转换为路径上的t值（0-1）
                        path_t = (current_frame_pos - first_frame) / (last_frame - first_frame)
                        path_t = max(0.0, min(1.0, path_t))  # 限制在0-1之间
                    else:
                        path_t = t
                
                # 沿着完整路径从起点到终点插值
                position = self._interpolate_along_path_by_length(prev_points_smooth, [], path_t)
            else:
                # 2. 方案A：在平滑后的路径上按长度插值
                position = self._interpolate_along_path_by_length(prev_points_smooth, next_points_smooth, t)
        else:
            # 向后兼容：使用原来的直线插值方法
            if len(prev_points) > 0 and len(next_points) > 0:
                if same_path:
                    # 如果使用相同路径，沿着路径插值
                    # 根据关键帧编号的比例计算路径上的位置
                    prev_frame = prev_kf['frame']
                    next_frame = next_kf['frame']
                    
                    # 找到所有关键帧中的最小和最大帧号（整个路径的起点和终点）
                    first_frame = min(kf['frame'] for kf in keyframes)
                    last_frame = max(kf['frame'] for kf in keyframes)
                    
                    if prev_frame == next_frame:
                        # 如果关键帧相同，根据关键帧在整个路径上的位置计算
                        if last_frame > first_frame:
                            path_t = (prev_frame - first_frame) / (last_frame - first_frame)
                            path_t = max(0.0, min(1.0, path_t))
                        else:
                            path_t = 0.0
                    else:
                        # 计算当前帧在整个路径上的位置
                        if last_frame > first_frame:
                            current_frame_pos = prev_frame + (next_frame - prev_frame) * t
                            path_t = (current_frame_pos - first_frame) / (last_frame - first_frame)
                            path_t = max(0.0, min(1.0, path_t))
                        else:
                            path_t = t
                    
                    position = self._interpolate_along_path_by_length(prev_points, [], path_t)
                else:
                    prev_pos = prev_points[0]
                    next_pos = next_points[0]
                    x = prev_pos['x'] * (1 - t) + next_pos['x'] * t
                    y = prev_pos['y'] * (1 - t) + next_pos['y'] * t
                    position = {'x': x, 'y': y}
            elif len(prev_points) > 0:
                position = prev_points[0].copy()
            elif len(next_points) > 0:
                position = next_points[0].copy()
            else:
                position = None
        
        if position is None:
            return None, path_kf_info
        
        return position, path_kf_info
    
    def _parse_keyframe_image_map(self, keyframe_image_map):
        """解析关键帧图片映射字符串"""
        image_map_dict = {}
        if not keyframe_image_map or not keyframe_image_map.strip():
            return image_map_dict
        
        try:
            # 格式：keyframe:image_index|keyframe:image_index
            # 例如：0:0|10:1|20:2
            map_strings = keyframe_image_map.split('|')
            for map_str in map_strings:
                if not map_str.strip():
                    continue
                
                parts = map_str.split(':')
                if len(parts) >= 2:
                    keyframe = int(parts[0])
                    image_index = int(parts[1])
                    image_map_dict[keyframe] = image_index
        except Exception as e:
            print(f"Error parsing keyframe image map: {e}")
            import traceback
            traceback.print_exc()
        
        return image_map_dict
    
    def _get_foreground_image_for_frame(self, frame_idx, keyframe_image_map_dict, foreground_image_list, foreground_scale):
        """
        根据当前帧获取对应的前景图
        如果关键帧有映射，使用映射的图片；否则使用最近的映射图片或第一个图片
        """
        # 找到当前帧对应的关键帧图片索引
        image_index = 0  # 默认使用第一个图片
        
        if len(keyframe_image_map_dict) > 0:
            # 找到小于等于当前帧的最大关键帧
            matching_keyframes = [kf for kf in keyframe_image_map_dict.keys() if kf <= frame_idx]
            if matching_keyframes:
                # 使用最大的关键帧对应的图片索引
                max_keyframe = max(matching_keyframes)
                image_index = keyframe_image_map_dict[max_keyframe]
            else:
                # 如果当前帧小于所有映射的关键帧，使用最小的关键帧对应的图片
                min_keyframe = min(keyframe_image_map_dict.keys())
                image_index = keyframe_image_map_dict[min_keyframe]
        
        # 确保索引有效
        if image_index < 0 or image_index >= len(foreground_image_list):
            image_index = 0
        
        # 获取对应的前景图
        fg_pil = foreground_image_list[image_index].copy()
        
        # 应用前景图缩放（如果设置了）
        if foreground_scale != 1.0:
            new_width = int(fg_pil.width * foreground_scale)
            new_height = int(fg_pil.height * foreground_scale)
            fg_pil = fg_pil.resize((new_width, new_height), Image.LANCZOS)
        
        return fg_pil
    
    def _normalize_images_to_same_size(self, images, masks, mode="max", custom_size=None):
        """
        将所有图片统一到相同尺寸
        mode: "max", "first", "custom", "original"
        """
        if not images or len(images) == 0:
            return images, masks
        
        if mode == "original":
            return images, masks  # 保持原始尺寸
        
        # 确定目标尺寸
        if mode == "max":
            target_width = max(img.width for img in images)
            target_height = max(img.height for img in images)
        elif mode == "first":
            target_width = images[0].width
            target_height = images[0].height
        elif mode == "custom":
            target_width = custom_size
            target_height = custom_size
        else:
            # 默认使用最大尺寸
            target_width = max(img.width for img in images)
            target_height = max(img.height for img in images)
        
        # 统一所有图片尺寸
        normalized_images = []
        for img in images:
            normalized = self._resize_with_padding(img, target_width, target_height)
            normalized_images.append(normalized)
        
        # 统一所有遮罩尺寸（如果提供）
        normalized_masks = None
        if masks is not None and len(masks) > 0:
            normalized_masks = []
            for i, mask in enumerate(masks):
                if i < len(normalized_images):
                    normalized_mask = self._resize_mask_with_padding(mask, target_width, target_height)
                    normalized_masks.append(normalized_mask)
                else:
                    # 如果遮罩数量少于图片数量，使用最后一个遮罩或创建空白遮罩
                    if len(normalized_masks) > 0:
                        normalized_masks.append(normalized_masks[-1])
                    else:
                        # 创建空白遮罩
                        blank_mask = torch.zeros((target_height, target_width), dtype=torch.float32)
                        normalized_masks.append(blank_mask)
        
        return normalized_images, normalized_masks
    
    def _resize_with_padding(self, img, target_width, target_height):
        """调整图片尺寸，保持宽高比，透明填充"""
        # 如果已经是目标尺寸，直接返回
        if img.width == target_width and img.height == target_height:
            if img.mode != 'RGBA':
                return img.convert('RGBA')
            return img.copy()
        
        # 计算缩放比例（保持宽高比）
        scale = min(target_width / img.width, target_height / img.height)
        new_width = int(img.width * scale)
        new_height = int(img.height * scale)
        
        # 缩放图片
        resized = img.resize((new_width, new_height), Image.LANCZOS)
        
        # 确保是RGBA格式
        if resized.mode != 'RGBA':
            resized = resized.convert('RGBA')
        
        # 创建目标尺寸的透明画布
        canvas = Image.new('RGBA', (target_width, target_height), (0, 0, 0, 0))
        
        # 居中放置
        x_offset = (target_width - new_width) // 2
        y_offset = (target_height - new_height) // 2
        canvas.paste(resized, (x_offset, y_offset), resized)
        
        return canvas
    
    def _resize_mask_with_padding(self, mask_tensor, target_width, target_height):
        """调整遮罩尺寸，保持宽高比，黑色填充"""
        # 处理遮罩tensor的形状
        if len(mask_tensor.shape) == 3:
            mask_tensor = mask_tensor[0]
        elif len(mask_tensor.shape) != 2:
            print(f"Warning: Unexpected mask shape {mask_tensor.shape}, creating blank mask")
            return torch.zeros((target_height, target_width), dtype=torch.float32)
        
        # 转换为numpy数组
        mask_np = mask_tensor.cpu().numpy()
        if mask_np.max() <= 1.0:
            mask_np = (mask_np * 255).astype(np.uint8)
        else:
            mask_np = mask_np.astype(np.uint8)
        
        mask_np = np.clip(mask_np, 0, 255)
        
        # 转换为PIL图像
        mask_pil = Image.fromarray(mask_np, 'L')
        
        # 如果已经是目标尺寸，直接返回
        if mask_pil.size == (target_width, target_height):
            mask_array = np.array(mask_pil).astype(np.float32) / 255.0
            return torch.from_numpy(mask_array)
        
        # 计算缩放比例（保持宽高比）
        scale = min(target_width / mask_pil.width, target_height / mask_pil.height)
        new_width = int(mask_pil.width * scale)
        new_height = int(mask_pil.height * scale)
        
        # 缩放遮罩
        resized_mask = mask_pil.resize((new_width, new_height), Image.LANCZOS)
        
        # 创建目标尺寸的黑色画布
        canvas = Image.new('L', (target_width, target_height), 0)
        
        # 居中放置
        x_offset = (target_width - new_width) // 2
        y_offset = (target_height - new_height) // 2
        canvas.paste(resized_mask, (x_offset, y_offset))
        
        # 转换回tensor
        mask_array = np.array(canvas).astype(np.float32) / 255.0
        return torch.from_numpy(mask_array)
    
    def _parse_effects_data(self, effects_data):
        """解析效果数据字符串"""
        effects_dict = {}
        if not effects_data or not effects_data.strip():
            return effects_dict
        
        try:
            # 格式：keyframe:scale_x,scale_y,rotation,flip_x,flip_y,opacity|keyframe:...
            effect_strings = effects_data.split('|')
            for eff_str in effect_strings:
                if not eff_str.strip():
                    continue
                
                parts = eff_str.split(':')
                if len(parts) >= 2:
                    keyframe = int(parts[0])
                    params_str = ':'.join(parts[1:])
                    params = params_str.split(',')
                    
                    if len(params) >= 6:
                        effects_dict[keyframe] = {
                            'scale_x': float(params[0]),
                            'scale_y': float(params[1]),
                            'rotation': float(params[2]),
                            'flip_x': bool(int(params[3])),
                            'flip_y': bool(int(params[4])),
                            'opacity': float(params[5])
                        }
        except Exception as e:
            print(f"Error parsing effects data: {e}")
            import traceback
            traceback.print_exc()
        
        return effects_dict
    
    def _get_effect_for_path_keyframe(self, path_kf_frame, effects_dict):
        """
        获取路径关键帧对应的效果
        如果路径关键帧有定义效果，直接返回；否则返回默认值
        （不在这个函数中查找最近的效果，避免所有未定义的关键帧都使用同一个效果）
        """
        default_effects = {
            'scale_x': 1.0,
            'scale_y': 1.0,
            'rotation': 0.0,
            'flip_x': False,
            'flip_y': False,
            'opacity': 1.0
        }
        
        # 如果路径关键帧有定义效果，直接返回
        if path_kf_frame in effects_dict:
            return effects_dict[path_kf_frame].copy()
        
        # 如果路径关键帧没有定义效果，返回默认值
        # 这样在插值时，未定义的关键帧会使用默认值，已定义的关键帧会使用定义的值
        # 插值会在默认值和定义值之间进行
        return default_effects
    
    def _interpolate_effects_based_on_path(self, effects_dict, current_frame, total_frames, 
                                          path_keyframes, path_kf_info):
        """
        基于路径关键帧插值计算当前效果参数
        这是核心方法：效果插值与路径关键帧同步
        """
        # 默认效果
        default_effects = {
            'scale_x': 1.0,
            'scale_y': 1.0,
            'rotation': 0.0,
            'flip_x': False,
            'flip_y': False,
            'opacity': 1.0
        }
        
        if len(effects_dict) == 0:
            return default_effects
        
        # 如果没有路径关键帧信息，使用旧方法（向后兼容）
        if path_kf_info['prev_kf_frame'] is None:
            return self._interpolate_effects_legacy(effects_dict, current_frame, total_frames)
        
        # 获取路径关键帧对应的效果
        prev_path_kf_frame = path_kf_info['prev_kf_frame']
        next_path_kf_frame = path_kf_info['next_kf_frame']
        t = path_kf_info['t']
        
        # 获取路径关键帧对应的效果
        prev_effects = self._get_effect_for_path_keyframe(prev_path_kf_frame, effects_dict)
        next_effects = self._get_effect_for_path_keyframe(next_path_kf_frame, effects_dict)
        
        # 如果当前帧正好是某个路径关键帧，直接返回该关键帧的效果
        if current_frame == prev_path_kf_frame:
            return prev_effects
        if current_frame == next_path_kf_frame:
            return next_effects
        
        # 在路径关键帧之间插值效果
        # 插值数值参数
        scale_x = prev_effects['scale_x'] * (1 - t) + next_effects['scale_x'] * t
        scale_y = prev_effects['scale_y'] * (1 - t) + next_effects['scale_y'] * t
        
        # 旋转角度插值（处理360度循环）
        prev_rot = prev_effects['rotation']
        next_rot = next_effects['rotation']
        # 找到最短路径
        diff = next_rot - prev_rot
        if abs(diff) > 180:
            if diff > 0:
                diff -= 360
            else:
                diff += 360
        rotation = prev_rot + diff * t
        
        # 布尔值：在中间帧时，如果t<0.5使用前一个，否则使用后一个
        flip_x = prev_effects['flip_x'] if t < 0.5 else next_effects['flip_x']
        flip_y = prev_effects['flip_y'] if t < 0.5 else next_effects['flip_y']
        
        # 透明度插值
        opacity = prev_effects['opacity'] * (1 - t) + next_effects['opacity'] * t
        
        return {
            'scale_x': scale_x,
            'scale_y': scale_y,
            'rotation': rotation,
            'flip_x': flip_x,
            'flip_y': flip_y,
            'opacity': opacity
        }
    
    def _interpolate_effects_legacy(self, effects_dict, current_frame, total_frames):
        """
        旧的效果插值方法（向后兼容）
        在效果关键帧之间插值
        """
        default_effects = {
            'scale_x': 1.0,
            'scale_y': 1.0,
            'rotation': 0.0,
            'flip_x': False,
            'flip_y': False,
            'opacity': 1.0
        }
        
        if len(effects_dict) == 0:
            return default_effects
        
        if len(effects_dict) == 1:
            return list(effects_dict.values())[0]
        
        sorted_frames = sorted(effects_dict.keys())
        prev_frame = None
        next_frame = None
        
        for frame in sorted_frames:
            if frame <= current_frame:
                prev_frame = frame
            else:
                next_frame = frame
                break
        
        if prev_frame is None:
            prev_frame = sorted_frames[0]
            if len(sorted_frames) > 1:
                next_frame = sorted_frames[1]
        
        if next_frame is None:
            if len(sorted_frames) > 1:
                prev_frame = sorted_frames[-2]
            next_frame = sorted_frames[-1]
        
        if current_frame == prev_frame:
            return effects_dict[prev_frame].copy()
        if current_frame == next_frame:
            return effects_dict[next_frame].copy()
        
        if prev_frame == next_frame:
            t = 0.0
        else:
            t = (current_frame - prev_frame) / (next_frame - prev_frame)
        t = max(0.0, min(1.0, t))
        
        prev_effects = effects_dict[prev_frame]
        next_effects = effects_dict[next_frame]
        
        scale_x = prev_effects['scale_x'] * (1 - t) + next_effects['scale_x'] * t
        scale_y = prev_effects['scale_y'] * (1 - t) + next_effects['scale_y'] * t
        
        prev_rot = prev_effects['rotation']
        next_rot = next_effects['rotation']
        diff = next_rot - prev_rot
        if abs(diff) > 180:
            if diff > 0:
                diff -= 360
            else:
                diff += 360
        rotation = prev_rot + diff * t
        
        flip_x = prev_effects['flip_x'] if t < 0.5 else next_effects['flip_x']
        flip_y = prev_effects['flip_y'] if t < 0.5 else next_effects['flip_y']
        opacity = prev_effects['opacity'] * (1 - t) + next_effects['opacity'] * t
        
        return {
            'scale_x': scale_x,
            'scale_y': scale_y,
            'rotation': rotation,
            'flip_x': flip_x,
            'flip_y': flip_y,
            'opacity': opacity
        }
    
    def _transform_fg_with_effects(self, fg_pil, effects):
        """应用缩放/旋转/翻转/透明度，返回RGBA前景图"""
        fg_transformed = self._apply_effects(fg_pil, effects)
        if fg_transformed.mode != 'RGBA':
            fg_rgba = fg_transformed.convert('RGBA')
        else:
            fg_rgba = fg_transformed.copy()
        
        if effects['opacity'] < 1.0:
            alpha = fg_rgba.split()[3]
            alpha = alpha.point(lambda p: int(p * effects['opacity']))
            fg_rgba.putalpha(alpha)
        return fg_rgba
    
    def _composite_frame_with_effects(self, bg_pil, fg_pil, position, center_anchor, effects):
        """应用效果并合成单帧图像（兼容旧调用）"""
        # 创建输出图像
        output = bg_pil.copy().convert("RGBA")
        
        # 应用效果到前景图
        fg_rgba = self._transform_fg_with_effects(fg_pil, effects)
        
        # 计算前景图的粘贴位置
        if center_anchor:
            # 以中心为锚点
            paste_x = int(position['x'] - fg_rgba.width / 2)
            paste_y = int(position['y'] - fg_rgba.height / 2)
        else:
            # 以左上角为锚点
            paste_x = int(position['x'])
            paste_y = int(position['y'])
        
        # 粘贴前景图
        output.paste(fg_rgba, (paste_x, paste_y), fg_rgba)
        
        # 转换回RGB
        return output.convert("RGB")
    
    def _apply_effects(self, img_pil, effects):
        """应用变换效果到图像"""
        result = img_pil.copy()
        
        # 1. 缩放
        if effects['scale_x'] != 1.0 or effects['scale_y'] != 1.0:
            new_width = int(result.width * effects['scale_x'])
            new_height = int(result.height * effects['scale_y'])
            if new_width > 0 and new_height > 0:
                result = result.resize((new_width, new_height), Image.LANCZOS)
        
        # 2. 旋转
        if abs(effects['rotation']) > 0.01:
            # 转换为RGBA以支持透明背景
            if result.mode != 'RGBA':
                result = result.convert('RGBA')
            result = result.rotate(
                -effects['rotation'],  # PIL的rotate是逆时针，所以取负
                expand=True,
                fillcolor=(0, 0, 0, 0)
            )
        
        # 3. 镜像
        if effects['flip_x']:
            result = result.transpose(Image.FLIP_LEFT_RIGHT)
        if effects['flip_y']:
            result = result.transpose(Image.FLIP_TOP_BOTTOM)
        
        return result
    
    def _composite_frame(self, bg_pil, fg_pil, position, center_anchor):
        """合成单帧图像（保留原方法以兼容）"""
        # 创建输出图像
        output = bg_pil.copy().convert("RGBA")
        
        # 计算前景图的粘贴位置
        if center_anchor:
            # 以中心为锚点
            paste_x = int(position['x'] - fg_pil.width / 2)
            paste_y = int(position['y'] - fg_pil.height / 2)
        else:
            # 以左上角为锚点
            paste_x = int(position['x'])
            paste_y = int(position['y'])
        
        # 确保前景图是RGBA格式
        if fg_pil.mode != 'RGBA':
            fg_rgba = fg_pil.convert('RGBA')
        else:
            fg_rgba = fg_pil.copy()
        
        # 粘贴前景图
        output.paste(fg_rgba, (paste_x, paste_y), fg_rgba)
        
        # 转换回RGB
        return output.convert("RGB")
    
    def _apply_mask(self, fg_pil, mask_tensor):
        """
        将遮罩应用到前景图
        mask_tensor: ComfyUI遮罩格式，形状为 (1, H, W) 或 (H, W)，值在0-1之间
        白色区域（值接近1）保留前景图，黑色区域（值接近0）透明
        """
        # 处理遮罩tensor的形状
        if len(mask_tensor.shape) == 3:
            # (1, H, W) -> (H, W)
            mask_tensor = mask_tensor[0]
        elif len(mask_tensor.shape) == 2:
            # (H, W) 已经是正确形状
            pass
        else:
            print(f"Warning: Unexpected mask shape {mask_tensor.shape}, skipping mask application")
            return fg_pil
        
        # 转换为numpy数组并归一化到0-255
        mask_np = mask_tensor.cpu().numpy()
        if mask_np.max() <= 1.0:
            mask_np = (mask_np * 255).astype(np.uint8)
        else:
            mask_np = mask_np.astype(np.uint8)
        
        # 确保值在0-255范围内
        mask_np = np.clip(mask_np, 0, 255)
        
        # 转换为PIL图像
        mask_pil = Image.fromarray(mask_np, 'L')
        
        # 确保前景图是RGBA格式
        if fg_pil.mode != 'RGBA':
            fg_rgba = fg_pil.convert('RGBA')
        else:
            fg_rgba = fg_pil.copy()
        
        # 调整遮罩尺寸以匹配前景图
        if mask_pil.size != fg_rgba.size:
            mask_pil = mask_pil.resize(fg_rgba.size, Image.LANCZOS)
        
        # 获取前景图的alpha通道
        fg_alpha = fg_rgba.split()[3]
        
        # 将遮罩应用到alpha通道（遮罩的白色区域保留，黑色区域透明）
        # 遮罩值（0-255）与现有alpha相乘
        mask_array = np.array(mask_pil).astype(np.float32) / 255.0
        alpha_array = np.array(fg_alpha).astype(np.float32) / 255.0
        
        # 遮罩与现有alpha相乘（白色保留，黑色透明）
        combined_alpha = (mask_array * alpha_array * 255).astype(np.uint8)
        
        # 创建新的alpha通道
        new_alpha = Image.fromarray(combined_alpha, 'L')
        
        # 应用新的alpha通道
        fg_rgba.putalpha(new_alpha)
        
        return fg_rgba
    
    def _tensor_to_pil(self, tensor):
        """将tensor转换为PIL图像"""
        # tensor格式: (H, W, C) 或 (C, H, W)
        if len(tensor.shape) == 4:
            tensor = tensor[0]
        
        if tensor.shape[0] == 3 or tensor.shape[0] == 4:
            # (C, H, W) -> (H, W, C)
            tensor = tensor.permute(1, 2, 0)
        
        # 转换为numpy并归一化到0-255
        img_np = tensor.cpu().numpy()
        if img_np.max() <= 1.0:
            img_np = (img_np * 255).astype(np.uint8)
        else:
            img_np = img_np.astype(np.uint8)
        
        # 确保值在0-255范围内
        img_np = np.clip(img_np, 0, 255)
        
        if img_np.shape[2] == 3:
            return Image.fromarray(img_np, 'RGB')
        elif img_np.shape[2] == 4:
            return Image.fromarray(img_np, 'RGBA')
        else:
            return Image.fromarray(img_np[:, :, 0], 'L').convert('RGB')
    
    def _pil_to_tensor(self, pil_img):
        """将PIL图像转换为tensor"""
        # 转换为RGB
        if pil_img.mode != 'RGB':
            pil_img = pil_img.convert('RGB')
        
        # 转换为numpy数组并归一化到0-1
        img_np = np.array(pil_img).astype(np.float32) / 255.0
        
        # 转换为tensor: (H, W, C) -> (1, H, W, C)
        img_tensor = torch.from_numpy(img_np).unsqueeze(0)
        
        return img_tensor

# author.yichengup.ImageAnimatePath 2025.01.XX

NODE_CLASS_MAPPINGS = {
    "ycImageAnimatePath": ycImageAnimatePath,
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "ycImageAnimatePath": "Image Animate Path"
}

