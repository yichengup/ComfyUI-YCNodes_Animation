import nodes

class ycAnimationEffectsMerge:
    """
    动画效果合并节点：
    - 合并多个关键帧的效果数据
    - 支持连接多个Animation Effects节点的输出
    """
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "effects_1": ("STRING", {"default": "", "tooltip": "效果数据1"}),
            },
            "optional": {
                "effects_2": ("STRING", {"default": ""}),
                "effects_3": ("STRING", {"default": ""}),
                "effects_4": ("STRING", {"default": ""}),
                "effects_5": ("STRING", {"default": ""}),
                "effects_6": ("STRING", {"default": ""}),
                "effects_7": ("STRING", {"default": ""}),
                "effects_8": ("STRING", {"default": ""}),
            },
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("merged_effects",)

    FUNCTION = "merge"
    CATEGORY = 'YCNode/Animation'

    def merge(self, effects_1, effects_2="", effects_3="", effects_4="", 
              effects_5="", effects_6="", effects_7="", effects_8=""):
        # 收集所有非空的效果数据
        all_effects = []
        for eff in [effects_1, effects_2, effects_3, effects_4, 
                    effects_5, effects_6, effects_7, effects_8]:
            if eff and eff.strip():
                all_effects.append(eff.strip())
        
        # 合并所有效果数据，用|分隔
        merged = '|'.join(all_effects)
        
        return (merged,)

# author.yichengup.AnimationEffectsMerge 2025.01.XX

NODE_CLASS_MAPPINGS = {
    "ycAnimationEffectsMerge": ycAnimationEffectsMerge,
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "ycAnimationEffectsMerge": "Animation Effects Merge"
}

