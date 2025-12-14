import nodes

class ycAnimationEffects:
    """
    动画效果定义节点：
    - 为指定关键帧定义动画效果
    - 支持缩放、旋转、镜像、透明度等基础效果
    - 输出效果数据供动画合成节点使用
    """
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "keyframe": ("INT", {"default": 0, "min": 0, "max": 999}),
                "scale_x": ("FLOAT", {"default": 1.0, "min": 0.1, "max": 5.0, "step": 0.1}),
                "scale_y": ("FLOAT", {"default": 1.0, "min": 0.1, "max": 5.0, "step": 0.1}),
                "rotation": ("FLOAT", {"default": 0.0, "min": -360.0, "max": 360.0, "step": 0.5}),
                "flip_x": ("BOOLEAN", {"default": False}),
                "flip_y": ("BOOLEAN", {"default": False}),
                "opacity": ("FLOAT", {"default": 1.0, "min": 0.0, "max": 1.0, "step": 0.01}),
            },
        }

    RETURN_TYPES = ("STRING", "INT")
    RETURN_NAMES = ("effects_data", "keyframe")

    FUNCTION = "main"
    CATEGORY = 'YCNode/Animation'

    def main(self, keyframe, scale_x, scale_y, rotation, flip_x, flip_y, opacity):
        # 格式化效果数据
        # 格式：keyframe:scale_x,scale_y,rotation,flip_x,flip_y,opacity
        flip_x_int = 1 if flip_x else 0
        flip_y_int = 1 if flip_y else 0
        
        effects_str = f"{keyframe}:{scale_x},{scale_y},{rotation},{flip_x_int},{flip_y_int},{opacity}"
        
        return (effects_str, keyframe)

# author.yichengup.AnimationEffects 2025.01.XX

NODE_CLASS_MAPPINGS = {
    "ycAnimationEffects": ycAnimationEffects,
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "ycAnimationEffects": "Animation Effects"
}

