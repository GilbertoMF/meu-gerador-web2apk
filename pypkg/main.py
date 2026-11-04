from kivy.app import App
from kivy.uix.boxlayout import BoxLayout
from kivy.uix.gridlayout import GridLayout
from kivy.uix.textinput import TextInput
from kivy.uix.button import Button
from kivy.metrics import dp
from kivy.graphics import Color, Rectangle
from kivy.core.window import Window

Window.clearcolor = (0.08, 0.08, 0.08, 1)


class CalcButton(Button):
    pass


class CalculatorLayout(BoxLayout):
    def __init__(self, **kwargs):
        super().__init__(orientation="vertical", padding=dp(10), spacing=dp(10), **kwargs)

        self.display = TextInput(
            text="0",
            readonly=True,
            multiline=False,
            halign="right",
            font_size=dp(40),
            size_hint=(1, 0.25),
            background_color=(0.15, 0.15, 0.15, 1),
            foreground_color=(1, 1, 1, 1),
            cursor_color=(1, 1, 1, 1),
            padding=[dp(10), dp(20), dp(10), dp(20)],
        )
        self.add_widget(self.display)

        self.expression = ""

        buttons = [
            ["C", "DEL", "%", "/"],
            ["7", "8", "9", "*"],
            ["4", "5", "6", "-"],
            ["1", "2", "3", "+"],
            ["0", ".", "=", ""],
        ]

        grid = GridLayout(cols=4, spacing=dp(8), size_hint=(1, 0.75))

        for row in buttons:
            for key in row:
                if key == "":
                    placeholder = Button(
                        text="",
                        background_color=(0, 0, 0, 0),
                        disabled=True,
                    )
                    grid.add_widget(placeholder)
                    continue

                btn = CalcButton(
                    text=key,
                    font_size=dp(28),
                    size_hint=(1, 1),
                    background_normal="",
                    background_color=self.get_color(key),
                    color=(1, 1, 1, 1),
                )
                btn.bind(on_press=self.on_button_press)
                grid.add_widget(btn)

        self.add_widget(grid)

    def get_color(self, key):
        if key == "C":
            return (0.7, 0.2, 0.2, 1)
        if key == "DEL":
            return (0.6, 0.3, 0.1, 1)
        if key == "=":
            return (0.2, 0.5, 0.2, 1)
        if key in ["/", "*", "-", "+", "%"]:
            return (0.25, 0.25, 0.4, 1)
        return (0.2, 0.2, 0.2, 1)

    def on_button_press(self, instance):
        key = instance.text

        if key == "C":
            self.expression = ""
            self.display.text = "0"
            return

        if key == "DEL":
            self.expression = self.expression[:-1]
            self.display.text = self.expression if self.expression else "0"
            return

        if key == "=":
            self.calculate()
            return

        if key == "%":
            self.expression += "/100"
        else:
            self.expression += key

        self.display.text = self.expression if self.expression else "0"

    def calculate(self):
        try:
            safe_expr = self.expression.replace("--", "+")
            if not safe_expr:
                return
            allowed = "0123456789+-*/.()% "
            for ch in safe_expr:
                if ch not in allowed:
                    raise ValueError("Caractere inválido")
            result = eval(safe_expr, {"__builtins__": None}, {})
            if isinstance(result, float):
                if result.is_integer():
                    result = int(result)
                else:
                    result = round(result, 8)
            self.expression = str(result)
            self.display.text = self.expression
        except ZeroDivisionError:
            self.display.text = "Erro: divisão por zero"
            self.expression = ""
        except Exception:
            self.display.text = "Erro"
            self.expression = ""


class CalculadoraApp(App):
    def build(self):
        self.title = "Calculadora"
        return CalculatorLayout()


if __name__ == "__main__":
    CalculadoraApp().run()