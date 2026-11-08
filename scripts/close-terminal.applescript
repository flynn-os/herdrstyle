on run argv
  if (count of argv) is 0 then return
  set targetTTY to item 1 of argv
  tell application "System Events"
    if exists process "Terminal" then
      tell application "Terminal"
        repeat with w in windows
          repeat with t in tabs of w
            if tty of t is targetTTY then
              close t
              return
            end if
          end repeat
        end repeat
      end tell
    end if
  end tell
end run
