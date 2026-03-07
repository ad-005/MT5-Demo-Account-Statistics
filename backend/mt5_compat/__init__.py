"""
MT5 compatibility module.

Detects the operating system and imports the appropriate MetaTrader5 package:
- macOS: siliconmetatrader5
- Windows: MetaTrader5
"""
import platform
import importlib
import logging

logger = logging.getLogger(__name__)

mt5 = None
MT5_MODULE_NAME = None


def get_mt5():
    global mt5, MT5_MODULE_NAME
    if mt5 is not None:
        return mt5

    system = platform.system()

    if system == "Darwin":
        try:
            mt5 = importlib.import_module("siliconmetatrader5")
            MT5_MODULE_NAME = "siliconmetatrader5"
            logger.info("Loaded siliconmetatrader5 for macOS")
        except ImportError:
            logger.warning(
                "siliconmetatrader5 not installed. "
                "Install with: pip install siliconmetatrader5"
            )
            raise ImportError(
                "siliconmetatrader5 is required on macOS. "
                "Install with: pip install siliconmetatrader5"
            )
    elif system == "Windows":
        try:
            mt5 = importlib.import_module("MetaTrader5")
            MT5_MODULE_NAME = "MetaTrader5"
            logger.info("Loaded MetaTrader5 for Windows")
        except ImportError:
            logger.warning(
                "MetaTrader5 not installed. "
                "Install with: pip install MetaTrader5"
            )
            raise ImportError(
                "MetaTrader5 is required on Windows. "
                "Install with: pip install MetaTrader5"
            )
    else:
        try:
            mt5 = importlib.import_module("MetaTrader5")
            MT5_MODULE_NAME = "MetaTrader5"
            logger.info("Loaded MetaTrader5 for Linux")
        except ImportError:
            raise ImportError(
                "MetaTrader5 is required. Install with: pip install MetaTrader5"
            )

    return mt5
