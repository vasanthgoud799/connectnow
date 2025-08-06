// src/components/ui/color-picker.jsx
import { useState } from 'react';

function ColorPicker({ value, onChange }) {
    return (
        <input
            type="color"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="w-full h-10 p-1 border rounded"
        />
    );
}

export default ColorPicker;
