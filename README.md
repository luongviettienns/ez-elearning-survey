# Ez-Elearning — Website khảo sát giáo viên

Website dạng storytelling một trang, cuộn từ câu chuyện AI tới biểu mẫu phản hồi. Giao diện responsive, chuyển động khi cuộn, 14 câu hỏi, lưu dữ liệu bền vững bằng tệp JSONL và có trang admin xuất CSV/JSON.

## Chạy thử trong máy (Windows / Mac / Linux)

Yêu cầu **Node.js 20+**. Không cần cài npm packages.

```bash
cd ez-elearning-survey
# Windows PowerShell:
$env:ADMIN_KEY="mat-khau-quan-tri-day-du-it-nhat-12-ky-tu"
npm start
# macOS/Linux:
# ADMIN_KEY="mat-khau-quan-tri-day-du-it-nhat-12-ky-tu" npm start
```

- Biểu mẫu: <http://localhost:3000>
- Thống kê quản trị: <http://localhost:3000/admin>
- API sức khỏe: <http://localhost:3000/api/health>
- Nhấn **Gửi ý kiến** để lưu vào `data/submissions.jsonl`.
- Vào `/admin`, nhập chính xác ADMIN_KEY để xem số phản hồi, biểu đồ và tải CSV hoặc JSON.

## Triển khai trên Internet

Hosting **Node.js chạy lâu dài** (VPS, Render có persistent disk, Railway có volume, ...): `npm start` + PORT được cấp bởi nền tảng + `ADMIN_KEY` đủ mạnh + `DATA_DIR` trỏ tới **volume lưu trữ bền vững**. Cấu hình HTTPS và sao lưu volume thường xuyên.

### Vercel

- Framework Preset: **Node.js**. Vercel dùng `server.mjs` làm HTTP server và phục vụ các tệp trong `public/`.
- Đặt `SUPABASE_URL`, `SUPABASE_KEY` và `ADMIN_KEY` (ít nhất 12 ký tự) trong Environment Variables cho Production/Preview. Không upload `.env`.
- Chạy `supabase.sql` trong Supabase SQL Editor để tạo bảng `submissions` trước khi nhận phản hồi thật.
- Trên Vercel (`VERCEL=1`), server không tạo hoặc ghi file JSONL; chỉ lưu vào Supabase. Nếu thiếu cấu hình, `/api/health` trả 503 và gửi khảo sát bị từ chối. Endpoint này kiểm tra cấu hình, không kiểm tra kết nối database.
- Khóa Supabase dạng `sb_publishable_...` hoặc `sb_secret_...` được gửi qua header `apikey`; khóa JWT cũ vẫn dùng thêm `Authorization: Bearer`.
- Không rewrite `/api/*` sang `/api/index.js` khi dùng Node.js server: server tự xử lý các đường dẫn `/api/health`, `/api/survey` và `/api/admin/*`.
- Sau khi cập nhật source và biến môi trường, deploy lại và kiểm tra `/`, `/admin`, `/api/health`.

Chạy `npm test` để kiểm tra khởi động/lưu khảo sát khi quyền ghi filesystem bị khóa, xử lý lỗi Supabase và lưu file khi chạy local. Các bài kiểm tra dùng database HTTP giả lập, không gửi phản hồi vào Supabase thật.

Không có OpenAI API key trong project: đây là trang **khảo sát** về tính năng AI, không tạo ảnh hoặc gọi AI. Chi phí 1.000đ/ảnh là giả định dùng trong khảo sát, không phải giá cố định hoặc cam kết chất lượng.

## Quyền riêng tư & bảo mật

- Không bắt buộc thu tên, số điện thoại hoặc email.
- Email tùy chọn nếu giáo viên muốn được liên hệ.
- Phải chấp thuận mục đích thu thập dữ liệu trước khi gửi.
- `ADMIN_KEY` đặt trên **server**, không viết trong frontend, không commit.
- Data lưu dạng JSONL (mỗi phản hồi 1 dòng); admin phải đăng nhập mới tải được.
- Endpoint POST có honeypot, giới hạn dung lượng và tốc độ cơ bản. Với chiến dịch công khai lớn, cần thêm chống spam, log, backup và chính sách lưu/xóa dữ liệu.

## Cấu trúc

```
server.mjs             # HTTP server, ghi khảo sát, thống kê, CSV
public/index.html     # Landing + form 4 chương
public/styles.css     # Tokens, responsive, scroll effects
public/app.js         # Logic khảo sát, validate, submit
public/admin.html     # Trang quản trị
public/admin.js       # Thống kê + export
public/mark.svg       # Biểu tượng logo
```

## Lưu ý sản phẩm

Đoạn nội dung về API (~1.000đ/ảnh) chỉ mang tính minh họa và phải kiểm chứng theo model, chất lượng và đầu ra thực tế. **Không cam kết 100%** về chính tả, lỗi dấu hoặc tính chính xác kiến thức của hình AI. Phiên bản ChatGPT miễn phí có thể có hạn mức khác nhau theo thời gian.

## Hiệu ứng cuộn và điểm nhấn (V2)

- Cuộn xuống: từng khối văn bản / thẻ tính năng xuất hiện dần; tiêu đề chương mở từng chữ theo vị trí cuộn.
- Phân cảnh **Từ ý tưởng → Prompt rõ ràng**: hai khung so sánh và đường tiến trình chuyển động theo vị trí cuộn.
- Phần giá ~1.000đ: đếm số một lần khi xuất hiện; chỉ thể hiện **giả định khảo sát**, không phải báo giá cố định.
- Biểu mẫu: từng câu xuất hiện nhẹ, lựa chọn được phản hồi tức thì; thanh tiến trình trên cùng và thanh chương ở màn hình lớn.
- Không cần thêm thư viện GSAP hoặc Framer Motion. Scroll dùng `requestAnimationFrame` + `IntersectionObserver`, hỗ trợ thiết lập giảm chuyển động.
- Có thể mở `ez-elearning-survey-preview.html` riêng để xem hiệu ứng **không cần backend**. Gửi khảo sát trong bản này chỉ mô phỏng; dữ liệu thực chỉ được lưu khi chạy server Node.js từ thư mục mã nguồn.
