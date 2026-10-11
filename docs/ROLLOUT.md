# Áp dụng bản sửa trên Vercel và Supabase

Source mới cần khóa server và hàm SQL `submit_survey`. Chỉ merge nhánh sửa vào `main` sau khi làm xong bước 1–3. Các bước dưới đây giữ cho bản đang chạy tiếp tục nhận phản hồi trong lúc chuyển đổi.

## 1. Đặt khóa riêng phía server

Trong Supabase Dashboard, chọn project đang dùng → Settings → API Keys. Lấy **secret key** dạng `sb_secret_…`; nếu dùng khóa JWT cũ, chọn **service_role**. Publishable/anon không dùng được với bản sửa này.

Trong Vercel → project `ez-elearning-survey` → Settings → Environment Variables, cấu hình cho **Production**:

- `SUPABASE_URL`: URL project Supabase hiện tại.
- `SUPABASE_SECRET_KEY`: khóa server vừa lấy.
- **Cập nhật cả `SUPABASE_KEY` bằng khóa server đó để bản code cũ tiếp tục hoạt động trong thời gian chuyển đổi.** Bản cũ chưa đọc biến `SUPABASE_SECRET_KEY`.
- `ADMIN_KEY`: giữ mật khẩu hiện tại, ít nhất 12 ký tự. Khóa này cũng dùng để băm IP; đổi nó sẽ reset nhận diện cooldown đang có.

Đặt các khóa này dưới dạng biến server/secret. Không đặt khóa server vào biến `NEXT_PUBLIC_*`, frontend, GitHub hoặc chat. Preview cần cấu hình khóa server riêng nếu muốn kiểm tra preview.

## 2. Redeploy bản `main` hiện tại với biến môi trường mới

Trước khi merge PR, vào Deployments → deployment Production đang chạy → Redeploy. Kiểm tra trang chính, `/api/health`, đăng nhập admin và việc gửi khảo sát. Việc redeploy này bảo đảm các function đang chạy đã nhận `SUPABASE_KEY` mới.

## 3. Chạy migration

Mở Supabase SQL Editor của đúng project. Copy toàn bộ **[supabase.sql](../supabase.sql)** của nhánh/PR sửa, rồi Run.

Script giữ nguyên bảng và nội dung phản hồi cũ, bỏ hai policy công khai, thu hồi quyền đọc/ghi của `anon`/`authenticated`, thêm bảng cooldown trong schema `private` và RPC chỉ cho `service_role` gọi. Các dòng cũ có `created_at = NULL` được gán thời điểm migration; những ngày gửi đã có được giữ nguyên. Script chạy trong transaction và có thể chạy lại.

Không chỉ sửa file trên GitHub: quyền database chỉ thay đổi sau khi SQL được chạy. Không thêm schema `private` vào danh sách exposed schemas.

## 4. Merge PR và kiểm tra bản mới

Merge nhánh sửa vào `main` để Vercel deploy source mới. Khi deployment Ready:

- `/`, `/admin` tải được; `/api/health` trả 200. Health chỉ xác nhận cấu hình, chưa chứng minh database kết nối được.
- Gửi một khảo sát kiểm tra: thành công 201 và có dữ liệu trong admin. Gửi tiếp ngay từ cùng IP: 429, thử lại sau 15 giây. Những người cùng mạng có thể cùng chịu cooldown này.
- Kiểm tra thống kê, CSV và JSON. Các lần đọc dùng phân trang, không dừng ở giới hạn 1.000 dòng.
- API admin khi không có mật khẩu vẫn trả 401. Dùng publishable key truy vấn trực tiếp bảng `submissions` hoặc RPC phải bị từ chối.

Test tự động: `npm ci` rồi `npm test`. Database kiểm thử chạy trong RAM bằng PGlite, không kết nối Supabase thật. Bộ test kiểm tra quyền SQL, dữ liệu cũ, cooldown/rollback và hơn 1.000 bản ghi.

## Nếu cần quay lại code cũ

Có thể redeploy commit trước PR với `SUPABASE_KEY` vẫn là khóa server. Giữ migration và quyền riêng tư mới; code cũ vẫn có quyền SELECT/INSERT qua `service_role`. Không mở lại policy công khai. Chống spam dùng chung sẽ chỉ hoạt động lại khi deploy source mới.
